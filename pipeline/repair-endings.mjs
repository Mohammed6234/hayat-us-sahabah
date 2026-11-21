// Last pass over data/build/book.json: a narration that still stops mid-sentence is
// completed from the archive.org text. Its last words are found in the raw OCR, and
// the text that follows is appended up to the end of that sentence. Trailing scan debris
// ("(ls", "■", "»", a leaked page header) is removed. Run after segment.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { buildVocab, cleanLine } from './clean.mjs';

const data = new URL('../data/', import.meta.url);
const book = JSON.parse(await readFile(new URL('build/book.json', data), 'utf8'));
const raws = await Promise.all([1, 2, 3].map((p) => readFile(new URL(`raw/part${p}.txt`, data), 'utf8')));
const vocab = buildVocab(raws.join('\n'));
const flat = raws.map((r) => r.replace(/\s+/g, ' '));

const ABRIDGED = /continues|rest of (the|this)|like the one above|already (been|passed)|will (soon )?be (quoted|mentioned)|part of (the|a|this)|chapter|as mentioned|previous|above|later|follow/i;
const DEBRIS = /(\s*([®™*^<>|•~■»«]|'\d+|\(\s*[a-z]{0,2}\s*\d?|\b[A-Z]\s*\)|j?Vol-\d\)\s*\d*|"l|'W|\(ls|\(1))+\s*$/;
const ended = (t) => /[.!?"'”)\]:]$/.test(t);

let completed = 0, tidied = 0;
for (const n of book.narrations) {
  const last = n.paras.length - 1;
  let t = n.paras[last].trim();
  if (ended(t) || ABRIDGED.test(t.slice(-200))) continue;
  const before = t;
  t = t.replace(DEBRIS, '').trim();
  if (!ended(t)) {
    // find the last 5 words in the raw text of this volume
    const words = t.split(/\s+/).filter((w) => /^[A-Za-z',;()-]+$/.test(w)).slice(-5);
    if (words.length >= 3) {
      const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+[^A-Za-z]*\\s*'));
      const raw = raws[n.vol - 1];
      const m = re.exec(raw);
      if (m) {
        // what follows on the page, skipping footnote blocks and the running page header
        const lines = raw.slice(m.index + m[0].length).split('\n').slice(0, 60);
        const kept = [];
        let inNote = false;
        for (const l of lines) {
          const x = l.trim();
          if (/LIVES\s+[O0]F\s+THE\s+SAHA/i.test(x)) { inNote = false; continue; }
          if (/^\(\d{1,2}\)\s/.test(x)) { inNote = true; continue; }
          if (!x) { if (inNote) inNote = 'blank'; continue; }
          if (inNote === true) continue;
          if (inNote === 'blank' && /\b(Vol|Pg)\b/.test(x)) continue;
          inNote = false;
          kept.push(x);
          if (kept.join(' ').length > 300) break;
        }
        const rest = kept.join(' ');
        const end = rest.search(/[.!?]["'”)]?(\s|\(|'|$)/);
        if (end >= 0 && end < 250) {
          const tail = cleanLine(rest.slice(0, end + 2).replace(/\(\d\)|['‘]\d['’]?/g, ''), vocab).replace(/\s+/g, ' ').trim();
          if (tail && /[A-Za-z]/.test(tail)) { t = `${t} ${tail}`.replace(/\s+([.,!?])/g, '$1'); completed++; }
        }
      }
    }
  }
  if (!ended(t) && /(\b[A-Z][a-z'’]+|ﷺ|\(RA\))$/.test(t)) t += '.';
  if (t !== before) { n.paras[last] = t; tidied++; }
}
await writeFile(new URL('build/book.json', data), JSON.stringify(book));
const open = book.narrations.filter((n) => { const t = n.paras.at(-1).trim(); return !ended(t) && !ABRIDGED.test(t.slice(-200)); });
console.log(`completed from source: ${completed}; endings tidied: ${tidied}; still open: ${open.length}`);
for (const n of open.slice(0, 15)) console.log(`  ${n.id} …${n.paras.at(-1).slice(-70)}`);
