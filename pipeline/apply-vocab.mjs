// Maps tagging output onto the approved vocabulary in data/vocab/ and writes
// data/tags.json (narration id -> tags) for the site.
//
// Reads data/full/out/*.json (full run: approved ids, or id:null + name for people
// not yet in the list, plus new_themes). Anything that does not map is written to
// data/review-queue.json instead of being dropped or guessed: it is the list of
// proposed vocabulary entries for a human (or the consolidation step) to approve,
// rename or merge. Re-run after every vocabulary change; it is idempotent.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const dir = new URL('../data/', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, dir), 'utf8'));

const people = await json('vocab/people.json');
const themes = await json('vocab/themes.json');
const ignore = await json('vocab/ignore.json');
const overrides = await json('vocab/overrides.json');
const redirect = (await json('vocab/merge.json'))._ids ?? {};

const key = (s) => String(s).toLowerCase().replace(/[’`]/g, "'").replace(/^hadhrat\s+/, '').replace(/\s+/g, ' ').trim();
const personIds = new Set(people.map((p) => p.id));
const personBy = new Map();
for (const p of people) for (const a of [p.name, ...p.aka]) personBy.set(key(a), p.id);
const themeIds = new Set(themes.map((t) => t.id));
const themeBy = new Map();
for (const t of themes) for (const a of [t.name, ...t.aka]) themeBy.set(key(a), t.id);

const ROLE_RANK = { subject: 3, narrator: 2, mentioned: 1 };
// Tagging output: full/out (first run, keyed by the ids of the first segmentation) and
// full/out2 (narrations recovered by later segmentation fixes, keyed by current ids).
const list = async (d) => { try { return (await readdir(new URL(d, dir))).filter((f) => f.endsWith('.json')).sort().map((f) => d + f); } catch { return []; } };
const files = [...await list('full/out/'), ...await list('full/out2/'), ...await list('full/out3/')];
let rekeyed = null;
try { rekeyed = await json('full/rekeyed.json'); } catch { /* ids unchanged */ }

const tags = {};
const queue = { people: {}, themes: {}, boundaries: [] };
const tagsOld = {};  // run -> {id -> tags}
for (const f of files) {
  const run = f.startsWith('full/out3/') ? 'v3' : f.startsWith('full/out2/') ? 'v2' : 'v1';
  for (const n of await json(f)) {
    const ov = overrides[n.id] ?? {};
    const roles = new Map();
    for (const p of n.people ?? []) {
      if ((p.name && ignore.people[p.name]) || (p.id && ignore.people[p.id])) continue;
      const role = ROLE_RANK[p.role] ? p.role : 'mentioned';
      const id = (p.name && ov.people?.[p.name])
        ?? (p.id && personIds.has(redirect[p.id] ?? p.id) ? (redirect[p.id] ?? p.id) : null)
        ?? (p.name ? personBy.get(key(p.name)) : null);
      if (!id) {
        const name = p.name ?? p.id;
        const q = (queue.people[name] ??= { sahabi: new Set(), ids: [] });
        q.sahabi.add(p.sahabi ?? 'unsure');
        q.ids.push(n.id);
        continue;
      }
      const prev = roles.get(id);
      if (!prev || ROLE_RANK[role] > ROLE_RANK[prev]) roles.set(id, role);
    }
    const ts = [];
    for (const t of [...(n.themes ?? []), ...(n.new_themes ?? [])]) {
      const id = themeIds.has(t) ? t : themeBy.get(key(t));
      if (!id) { (queue.themes[key(t)] ??= []).push(n.id); continue; }
      if (!ts.includes(id)) ts.push(id);
    }
    if (n.boundary && n.boundary !== 'ok') queue.boundaries.push({ id: n.id, boundary: n.boundary, notes: n.notes });
    ((run === 'v3' || !rekeyed) ? tags : (tagsOld[run] ??= {}))[n.id] = {
      summary: n.summary,
      prophet: n.prophet,
      people: [...roles].map(([id, role]) => ({ id, role })),
      themes: ts,
      boundary: n.boundary ?? 'ok',
    };
  }
}

// Per-narration corrections by current id (person-fixes.json: narration -> {from: to};
// "*" applies to every narration not listed), e.g. the four different Ibraheems.
let fixes = {};
try { fixes = await json('vocab/person-fixes.json'); } catch { /* none */ }
const applyFixes = (id, t) => {
  const f = { ...(fixes['*'] ?? {}), ...(fixes[id] ?? {}) };
  for (const p of t.people) if (f[p.id]) p.id = f[p.id];
};
// Carry first-run tags over to the current narration ids.
if (rekeyed) for (const [id, m] of Object.entries(rekeyed)) {
  if (tags[id]) continue;
  const t = (m.v2 && tagsOld.v2?.[m.v2]) ?? (m.v1 && tagsOld.v1?.[m.v1]);
  if (t) tags[id] = structuredClone(t);
}
for (const [id, t] of Object.entries(tags)) applyFixes(id, t);
for (const q of Object.values(queue.people)) q.sahabi = [...q.sahabi];
await writeFile(new URL('tags.json', dir), JSON.stringify(tags));
await writeFile(new URL('review-queue.json', dir), JSON.stringify(queue, null, 1));
const top = (o, k = 25) => Object.entries(o).sort((a, b) => (b[1].ids ?? b[1]).length - (a[1].ids ?? a[1]).length).slice(0, k)
  .map(([name, v]) => `${name} (${(v.ids ?? v).length})`).join(', ');
console.log(`${Object.keys(tags).length} narrations tagged from ${files.length} chunks`);
console.log(`unmapped people: ${Object.keys(queue.people).length} — ${top(queue.people)}`);
console.log(`unmapped themes: ${Object.keys(queue.themes).length} — ${top(queue.themes)}`);
console.log(`boundary flags: ${queue.boundaries.length}`);
