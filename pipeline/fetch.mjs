// Downloads the OCR text of the three volumes from archive.org into data/raw/.
// archive.org's /download/ links redirect to rotating mirror hosts, so we read the
// /stream/ page instead (served from archive.org itself) and take the text out of its <pre>.
import { writeFile, mkdir } from 'node:fs/promises';

const ITEM = 'HayatUsSahabah-english-ByShaykhMuhammadYusufKandhelvir.a';
const file = (p) => `HayatUsSahabah-english-Part-${p}ByShaykhMuhammadYusufKandhelvir.a_djvu.txt`;

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');

await mkdir(new URL('../data/raw/', import.meta.url), { recursive: true });
for (const p of [1, 2, 3]) {
  const url = `https://archive.org/stream/${ITEM}/${file(p)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const html = await res.text();
  const m = html.match(/<pre>([\s\S]*?)<\/pre>/);
  if (!m) throw new Error(`no <pre> in ${url}`);
  const out = new URL(`../data/raw/part${p}.txt`, import.meta.url);
  await writeFile(out, decode(m[1]));
  console.log(`part ${p}: ${m[1].length.toLocaleString()} chars`);
}
