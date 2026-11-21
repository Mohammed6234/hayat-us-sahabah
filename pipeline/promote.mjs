// Grows the people vocabulary from the review queue. Every proposed name that is not
// ignored or merged (data/vocab/merge.json) becomes an entry marked `auto: true`, so
// tagging never stalls on review. A human later checks auto entries (sahabi status,
// duplicates) and moves fixes into merge.json / people.json.
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../data/', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, dir), 'utf8'));
const people = await json('vocab/people.json');
const ignore = await json('vocab/ignore.json');
const merge = await json('vocab/merge.json');
const queue = await json('review-queue.json');

const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ids = new Map(people.map((p) => [p.id, p]));
const vote = (list) => (list.includes('yes') ? 'yes' : list.includes('unsure') ? 'unsure' : 'no');

let added = 0, merged = 0;
// First pass: create entries, so merge targets that are themselves proposals exist.
for (const [name, q] of Object.entries(queue.people)) {
  if (ignore.people[name] || typeof merge[name] === 'string' || name.startsWith('_')) continue;
  const id = slug(name);
  if (!id) continue;
  if (ids.has(id)) { const p = ids.get(id); if (!p.aka.includes(name)) p.aka.push(name); continue; }
  const p = { id, name: name.replace(/\s*\(.*\)$/, ''), sahabi: vote(q.sahabi), aka: [name], auto: true };
  people.push(p); ids.set(id, p); added++;
}
// Second pass: attach merged spellings as aliases of their canonical entry.
for (const [name, target] of Object.entries(merge)) {
  if (name.startsWith('_') || typeof target !== 'string') continue;
  let p = ids.get(target);
  if (!p) { p = { id: target, name, sahabi: 'unsure', aka: [], auto: true }; people.push(p); ids.set(target, p); }
  if (!p.aka.includes(name)) { p.aka.push(name); merged++; }
}
// Third pass: duplicate entries (merge._ids: old id -> canonical id) fold into the canonical one.
for (const [old, target] of Object.entries(merge._ids ?? {})) {
  const from = ids.get(old), to = ids.get(target);
  if (!from || !to) continue;
  for (const a of [from.name, ...from.aka]) if (!to.aka.includes(a)) to.aka.push(a);
  people.splice(people.indexOf(from), 1); ids.delete(old);
}
await writeFile(new URL('vocab/people.json', dir), JSON.stringify(people, null, 1));
console.log(`people vocabulary: ${people.length} (${added} added, ${merged} aliases merged)`);
