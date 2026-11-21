// Builds the site's data from the segmented book, the approved vocabulary and the tags.
//
//   site/data/index.json      everything needed to browse and filter: chapters, sections,
//                             and per narration its place, tags and a short excerpt
//   site/data/text-cNN.json   the full text and references of one chapter, loaded on demand
//
// Every narration is published in reading order; narrations not yet tagged simply
// have no people or themes, so they appear when reading but not in filters.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const data = new URL('../data/', import.meta.url);
const out = new URL('../site/data/', import.meta.url);
const read = async (p, fallback) => {
  try { return JSON.parse(await readFile(new URL(p, data), 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
};

const book = await read('build/book.json');
// Ambiguous bare names are not offered as a person to filter by: they could be several people.
const people = (await read('vocab/people.json', [])).filter((p) => !p.ambiguous);
const listed = new Set(people.map((p) => p.id));
const themes = await read('vocab/themes.json', []);
const tags = await read('tags.json', {});

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const excerpt = (paras) => {
  const t = paras.join(' ');
  return t.length > 170 ? `${t.slice(0, t.lastIndexOf(' ', 170))}…` : t;
};
const narrations = book.narrations.map((n) => {
  const t = tags[n.id];
  return {
    id: n.id, pos: n.pos, chapter: n.chapter, section: n.section, page: n.page,
    excerpt: excerpt(n.paras),
    ...(t ? { summary: t.summary, people: t.people.filter((p) => listed.has(p.id)), themes: t.themes } : {}),
  };
});

const usedPeople = new Set(narrations.flatMap((n) => (n.people ?? []).map((p) => p.id)));
const usedThemes = new Set(narrations.flatMap((n) => n.themes ?? []));
const index = {
  book: {
    title: 'The Lives of the Sahabah',
    author: 'Maulana Muhammad Yusuf Kandhlawi',
    translator: 'Mufti Afzal Hoosen Elias',
    volumes: book.volumes.map((v) => ({ n: v.n, title: v.title })),
    tagged: Object.keys(tags).length,
  },
  chapters: book.chapters,
  sections: book.sections,
  narrations,
  people: people.filter((p) => usedPeople.has(p.id)).map(({ id, name, sahabi }) => ({ id, name, sahabi })),
  themes: themes.filter((t) => usedThemes.has(t.id)).map(({ id, name, group }) => ({ id, name, group })),
};
await writeFile(new URL('index.json', out), JSON.stringify(index));

let textBytes = 0;
for (const c of book.chapters) {
  const text = {};
  for (const n of book.narrations) if (n.chapter === c.id) text[n.id] = { paras: n.paras, sources: n.sources.filter(Boolean) };
  const s = JSON.stringify(text);
  textBytes += s.length;
  await writeFile(new URL(`text-${c.id}.json`, out), s);
}
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`index.json ${kb(JSON.stringify(index).length)} (${narrations.length} narrations, ${index.book.tagged} tagged, ${index.people.length} people, ${index.themes.length} themes); chapter text ${kb(textBytes)} in ${book.chapters.length} files`);
