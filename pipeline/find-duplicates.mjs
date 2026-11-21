// Finds people entered twice under different transliterations. Two ids are treated as
// the same person when they reduce to the same form after normalising the book's
// spelling conventions (aa/a, ee/i, oo/u, doubled letters, h after consonants,
// bin/ibn, abi/abu, a trailing -ah/-a). Near misses (one letter apart) are listed
// separately for a human decision. Writes data/full/duplicates.json.
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../data/', import.meta.url);
const people = JSON.parse(await readFile(new URL('vocab/people.json', dir), 'utf8'));
const tags = JSON.parse(await readFile(new URL('tags.json', dir), 'utf8'));
const count = new Map();
for (const t of Object.values(tags)) for (const p of t.people) count.set(p.id, (count.get(p.id) ?? 0) + 1);

const norm = (id) => id
  .replace(/-(ibn|bin|bint|binti)-/g, '-b-').replace(/^ibn-/, 'b-')
  .replace(/-(abi|abu|abee|abil|abul)-/g, '-ab-').replace(/^(abu|abul|abi)-/, 'ab-')
  .replace(/^(ummu|umm|ummul)-/, 'um-')
  .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo|ow/g, 'u').replace(/ai/g, 'ay')
  .replace(/([bcdfgjklmnpqrstvwxz])h/g, '$1').replace(/(.)\1+/g, '$1')
  .replace(/ah(-|$)/g, 'a$1').replace(/e/g, 'i').replace(/o/g, 'u');

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

const live = people.filter((p) => !p.ambiguous);
const groups = new Map();
for (const p of live) { const k = norm(p.id); (groups.get(k) ?? groups.set(k, []).get(k)).push(p); }
const pick = (g) => [...g].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || (a.auto ? 1 : 0) - (b.auto ? 1 : 0))[0];
const same = [];
for (const g of groups.values()) if (g.length > 1) { const keep = pick(g); for (const p of g) if (p !== keep) same.push([p.id, keep.id]); }

// near misses: multi-part names (contain '-'), same first token, one edit apart after normalising
const keys = [...groups.keys()].filter((k) => k.includes('-'));
const near = [];
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const a = keys[i], b = keys[j];
  if (a.split('-')[0] !== b.split('-')[0] || Math.abs(a.length - b.length) > 1 || a.length < 9) continue;
  if (lev(a, b) === 1) near.push([pick(groups.get(a)).id, pick(groups.get(b)).id]);
}
await writeFile(new URL('full/duplicates.json', dir), JSON.stringify({ same, near }, null, 1));
console.log(`${same.length} spelling duplicates; ${near.length} near misses to check`);
for (const [a, b] of same.slice(0, 40)) console.log(`  ${a} (${count.get(a) ?? 0}) -> ${b} (${count.get(b) ?? 0})`);
console.log('near misses:'); for (const [a, b] of near) console.log(`  ${a} (${count.get(a) ?? 0}) ~ ${b} (${count.get(b) ?? 0})`);
