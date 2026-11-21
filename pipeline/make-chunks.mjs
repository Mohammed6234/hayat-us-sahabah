// Splits the whole book into tagging chunks (data/full/chunks/chunk-NNN.json), each
// small enough for one agent, and writes data/full/vocab-brief.md: the current
// approved vocabulary in the compact form the tagging prompt expects.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SIZE = Number(process.argv[2] ?? 40);
const root = new URL('../data/', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const book = await json('build/book.json');
const sections = new Map(book.sections.map((s) => [s.id, s]));
const chapters = new Map(book.chapters.map((c) => [c.id, c]));

await mkdir(new URL('full/chunks/', root), { recursive: true });
await mkdir(new URL('full/out/', root), { recursive: true });
const items = book.narrations.map((n) => {
  const s = sections.get(n.section);
  const parent = s.parent ? sections.get(s.parent) : null;
  return { id: n.id, chapter: chapters.get(n.chapter).title, heading: [parent?.title, s.title].filter(Boolean).join(' › '), text: n.paras.join('\n\n') };
});
let count = 0;
for (let i = 0; i < items.length; i += SIZE) {
  count++;
  await writeFile(new URL(`full/chunks/chunk-${String(count).padStart(3, '0')}.json`, root), JSON.stringify(items.slice(i, i + SIZE), null, 1));
}

// Ambiguous bare names ("Urwa", "Hasan") are left out so agents give the full name or propose one.
const people = (await json('vocab/people.json')).filter((p) => !p.ambiguous);
const themes = await json('vocab/themes.json');
const groups = [...new Set(themes.map((t) => t.group))];
// Compact form so the whole list fits in one read: ids grouped by first letter,
// many per line. The id is the name in book spelling; a suffix marks sahabi status.
const mark = { yes: '', unsure: ' (?)', no: ' (not sahabi)' };
const letters = [...new Set(people.map((p) => p.id[0]))].sort();
const brief = `# Approved vocabulary (generated — do not edit by hand)

## People
Each entry is an \`id\`, which is the person's name in the book's spelling.
"(?)" = Companion status unsure; "(not sahabi)" = not a Companion; no mark = Companion.
Read the WHOLE list before deciding someone is missing.

${letters.map((l) => `**${l.toUpperCase()}**: ${people.filter((p) => p.id[0] === l).sort((a, b) => a.id.localeCompare(b.id)).map((p) => `\`${p.id}\`${mark[p.sahabi] ?? ''}`).join('; ')}`).join('\n\n')}

## Themes — \`id\`: name
${groups.map((g) => `### ${g}\n${themes.filter((t) => t.group === g).map((t) => `- \`${t.id}\`: ${t.name}`).join('\n')}`).join('\n\n')}
`;
await writeFile(new URL('full/vocab-brief.md', root), brief);
console.log(`${count} chunks of ≤${SIZE} narrations; vocab: ${people.length} people, ${themes.length} themes`);
