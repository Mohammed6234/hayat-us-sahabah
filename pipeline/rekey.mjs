// Narration ids are positional, so fixing the segmentation shifts them. This maps every
// current narration to the id it had in each earlier segmentation whose tags we hold
// (book-v1.json for full/out, book-v2.json for full/out2), matching on opening words.
// Writes data/full/rekeyed.json {currentId: {v1, v2}} and data/full/untagged.json.
import { readFile, writeFile } from 'node:fs/promises';

const dir = new URL('../data/', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, dir), 'utf8'));
const current = await json('build/book.json');
const key = (n) => n.paras.join(' ').toLowerCase().replace(/[^a-z]/g, '');
const index = (book) => {
  const full = new Map(), short = new Map();
  for (const n of book.narrations) {
    const k = key(n);
    if (!full.has(k.slice(0, 160))) full.set(k.slice(0, 160), n.id);
    if (!short.has(k.slice(0, 60))) short.set(k.slice(0, 60), n.id);
  }
  return (n) => full.get(key(n).slice(0, 160)) ?? short.get(key(n).slice(0, 60));
};
const versions = { v1: index(await json('build/book-v1.json')), v2: index(await json('build/book-v2.json')) };
const out2ids = new Set();
try { for (const f of (await import('node:fs')).readdirSync(new URL('full/out2/', dir))) for (const n of await json(`full/out2/${f}`)) out2ids.add(n.id); } catch { /* none */ }

const map = {}, untagged = [];
for (const n of current.narrations) {
  const m = { v1: versions.v1(n), v2: versions.v2(n) };
  if (m.v2 && !out2ids.has(m.v2)) delete m.v2;      // v2 ids only matter where out2 tagged them
  if (m.v1 || m.v2) map[n.id] = m; else untagged.push(n.id);
}
await writeFile(new URL('full/rekeyed.json', dir), JSON.stringify(map));
await writeFile(new URL('full/untagged.json', dir), JSON.stringify(untagged));
console.log(`${Object.keys(map).length} narrations keep their tags; ${untagged.length} need tagging`);
