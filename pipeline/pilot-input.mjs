// Writes data/pilot/input.json: the first N narrations of the book, with their
// section headings, as input for the tagging pilot.
import { readFile, writeFile } from 'node:fs/promises';

const N = Number(process.argv[2] ?? 50);
const book = JSON.parse(await readFile(new URL('../data/build/book.json', import.meta.url), 'utf8'));
const sections = new Map(book.sections.map((s) => [s.id, s]));
const chapters = new Map(book.chapters.map((c) => [c.id, c]));

const input = book.narrations.slice(0, N).map((n) => {
  const s = sections.get(n.section);
  const parent = s.parent ? sections.get(s.parent) : null;
  return {
    id: n.id,
    chapter: chapters.get(n.chapter).title,
    heading: [parent?.title, s.title].filter(Boolean).join(' › '),
    text: n.paras.join('\n\n'),
  };
});
await writeFile(new URL('../data/pilot/input.json', import.meta.url), JSON.stringify(input, null, 1));
console.log(`${input.length} narrations, ${input.reduce((a, n) => a + n.text.split(/\s+/).length, 0)} words`);
