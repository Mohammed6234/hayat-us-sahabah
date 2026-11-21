// Turns data/raw/part{1,2,3}.txt into data/build/book.json:
//   volumes → chapters → sections (topic / sub-topic) → narrations, in the author's order.
//
// Strategy
//  1. Parse each volume's table of contents (every heading + page number).
//  2. Walk the body page by page: drop running headers, pull out the page's
//     footnotes (the source references), clean honorific junk, drop Arabic noise.
//  3. Find each TOC heading in the body in order (fuzzy match, OCR differs).
//  4. Rebuild paragraphs, then split a section into narrations at footnote
//     markers: every narration in this book ends with its reference note.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildVocab, cleanLine, isNoiseLine, norm, similarity, PBUH } from './clean.mjs';

const RAW = new URL('../data/raw/', import.meta.url);
const OUT = new URL('../data/build/', import.meta.url);

const HEADER = /LIVES\s+[O0]F\s+THE\s+SAHA/i;
const BODY_CHAPTER = /^Chapter\s+([A-Za-z]+)\s*$/;
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const chapterNo = (w) => {
  const k = w.toLowerCase().replace('theirteen', 'thirteen');
  return NUMBERS.indexOf(k) + 1;
};
// Footnote marker as the OCR renders it: (1)  '1'  <2)  '*'  ^  '2^  (3)
const MARKER = /(?<=[A-Za-z.,!?"'”}:)\]])\s{0,3}(\(\d{1,2}\)|['‘<({]\d{1,2}['’>)}^]+|['‘]?\*\d?['’^]+|\(\d{1,2}\^|(?<=["'”.)!?]\s{0,3})\^'?(?=\s*$))(?=\s|$)/g;
// Words that mark a line as the continuation of a source reference, not body text.
const REFERENCE = /\b(Vol\.?|Pg\.?|quoted|Kanzul|Majma|Haythami|Tabraani|Bayhaqi|Haakim|Bukhari|Muslim|Tirmidhi|Abu Dawood|Nasa'ee|Ibn Maajah|Musnad|Hilya|Isaabah|Bidaayah|Ibn Sa'd|Ibn Asaakir|Ibn Jareer|Abdur Razzaaq|Ibn Abi Shayba|Muntakhab|chain of narrators|reliable|authentic|weak)\b/;
const FOOTNOTE_START = /^\(\d{1,2}\)\s/;

function parseToc(lines, bodyStart) {
  const start = lines.findIndex((l) => /^CONTENTS\s*$/.test(l.trim()));
  const entries = [];
  let buf = '';
  for (let i = start + 1; i < bodyStart; i++) {
    const l = lines[i].trim();
    if (!l || HEADER.test(l)) continue;
    buf = buf ? `${buf} ${l}` : l;
    const m = buf.match(/^(.*?)[\s.:…,;'"]*\s(\d{1,4})\s*$/);
    if (m) {
      entries.push({ title: m[1].replace(/[\s.:…]+$/, ''), page: Number(m[2]) });
      buf = '';
    }
  }
  // Keep from the first chapter onwards (front matter is handled separately later).
  const first = entries.findIndex((e) => /^Chapter\s+\w+/.test(e.title));
  return entries.slice(first);
}

function segmentVolume(vol, text, vocab, report) {
  const lines = text.split('\n');
  const bodyStart = lines.findIndex((l, i) => i > 100 && BODY_CHAPTER.test(l.trim()));
  const toc = parseToc(lines, bodyStart);

  // ---- 1. pages: strip headers, separate footnotes ------------------------------
  const body = []; // {text, page, blank}
  const footnotes = new Map(); // page -> [text]
  let page = toc[0]?.page ?? 0;
  let inNotes = false;
  let afterBlank = false;
  let noteBuf = [];
  const flushNotes = () => {
    if (!noteBuf.length) return;
    const notes = [];
    // notes can also start mid-line: "Ibn Sa'd (Vol.4 Pg.137) (2) Ibn Sa'd ..."
    for (const l of noteBuf.join('\n').split(/(?:^|\n|\s)(?=\(\d{1,2}\)\s*[A-Z])/)) {
      const t = l.replace(/\n/g, ' ').trim();
      if (!t) continue;
      if (/^\(\d{1,2}\)\s*[A-Z]/.test(t) || !notes.length) notes.push(t.replace(/^\(\d{1,2}\)\s*/, ''));
      else notes[notes.length - 1] += ` ${t}`;
    }
    footnotes.set(page, notes.map((n) => cleanLine(n, vocab)));
    // Diagnostics: a "note" that does not read like a source reference is probably body
    // text that a line starting "(1) " pulled into the footnote area.
    for (const n of notes) {
      if (n.length > 350 && !/\b(Vol|Pg)\b/.test(n.slice(0, 200))) (report.suspectNotes ??= []).push({ vol, page, len: n.length, start: n.slice(0, 90) });
    }
    noteBuf = [];
  };
  // The last volume ends with a glossary, which is not part of the narrations.
  const glossary = lines.findIndex((l, i) => i > bodyStart && /^Glossary\s+of\s+Terms\s*$/.test(l.trim()));
  const bodyEnd = glossary > 0 ? glossary : lines.length;
  for (let i = bodyStart; i < bodyEnd; i++) {
    const raw = lines[i].replace(/\s+$/, '');
    if (HEADER.test(raw)) {
      flushNotes();
      inNotes = false;
      const m = raw.match(/(?:^|\s)(\d{1,4})\s*$/) ?? raw.match(/^(\d{1,4})\s/);
      const parsed = m ? Number(m[1]) : NaN;
      // OCR misreads page numbers ("12 ;" for 274): trust them only near the expected one
      page = parsed > page && parsed <= page + 8 ? parsed : page + 1;
      continue;
    }
    const t = raw.trim();
    if (BODY_CHAPTER.test(t)) { flushNotes(); inNotes = false; }
    // The scan sometimes prints a page's footnotes mid-page and carries on with body
    // text after them. Notes are contiguous lines; after a blank line, anything that is
    // not a new "(n)" note or a reference continuation is body text again.
    if (inNotes && t && afterBlank && !FOOTNOTE_START.test(t) && !/^\(\d{1,2}\)/.test(t) && !REFERENCE.test(t)) {
      flushNotes();
      inNotes = false;
    }
    afterBlank = !t;
    if (FOOTNOTE_START.test(t)) inNotes = true;
    if (inNotes) { if (t) noteBuf.push(t); continue; }
    body.push({ raw: t, page });
  }
  flushNotes();

  // ---- 2. find TOC headings in the body ------------------------------------------
  const isChapterEntry = (e) => /^Chapter\s+\w+/.test(e.title);
  // Compare headings on the cleaned, letters-only form, without honorific markers.
  const key = (s) => norm(cleanLine(s, vocab).replace(/ﷺ|\(RA\)/g, ' ')).replace(/isiaam/g, 'islaam');
  for (const e of toc) e.key = key(e.title);
  const lineKeys = body.map((b) => (b.raw ? key(b.raw) : ''));
  const entryChapter = (e) => chapterNo(e.title.split(/\s+/)[1].replace(/[^A-Za-z]/g, ''));

  // Score a window of body lines starting at i against a heading key.
  const windowScore = (i, want) => {
    const first = lineKeys[i];
    // the window must start where the heading starts, not on the line before it
    if (!first || similarity(first, want.slice(0, first.length)) < 0.72) return null;
    let best = null;
    let joined = '';
    for (let k = i, n = 0; k < body.length && n < 5; k++) {
      if (!body[k].raw) continue;
      n++;
      joined += lineKeys[k];
      if (joined.length > want.length * 1.3) break;
      if (joined.length < want.length * 0.75) continue;
      const s = similarity(joined, want);
      if (s >= 0.78 && (!best || s > best.s)) best = { span: k - i + 1, s };
    }
    return best;
  };

  // Each TOC entry is searched for on its own, near the page the TOC gives it,
  // so one unreadable heading never derails the ones after it.
  const startAt = new Map(); // body index -> {entry, span}
  let cursor = 0;
  for (const [j, e] of toc.entries()) {
    let found = null;
    if (isChapterEntry(e)) continue; // chapters come from the body itself (below)
    {
      for (let i = cursor; i < body.length; i++) {
        if (body[i].page > e.page + 2) break;
        if (body[i].page < e.page - 2 || !body[i].raw) continue;
        const w = windowScore(i, e.key);
        if (w) { found = { i, span: w.span }; break; }
      }
    }
    if (!found) { report.missedHeadings.push(`v${vol} p${e.page}: ${e.title}`); continue; }
    startAt.set(found.i, { entry: j, span: found.span });
    cursor = found.i + found.span;
  }

  // Chapters: "Chapter N" lines in the body, in increasing order. (Volume 2's TOC
  // has no entry for Chapter Eight, so the TOC cannot be trusted for these.)
  let expect = toc.filter(isChapterEntry).map(entryChapter).find((n) => n > 0) ?? 1;
  for (let i = 0; i < body.length; i++) {
    const m = body[i].raw.match(BODY_CHAPTER);
    const listed = toc.find((e) => isChapterEntry(e) && entryChapter(e) === expect);
    if (m && chapterNo(m[1]) === expect && (!listed || Math.abs(body[i].page - listed.page) <= 3)) {
      startAt.set(i, { chapter: expect, span: 1 });
      expect++;
    }
  }

  // Footnote markers are resolved line by line, so each one is looked up on the
  // page it is printed on: the i-th marker on a page takes that page's i-th note.
  const notes = []; // volume-wide; text carries ⟦index⟧ placeholders into this
  const pageCursor = new Map();
  const withMarkers = (line, pageNo) => line.replace(MARKER, () => {
    const i = pageCursor.get(pageNo) ?? 0;
    pageCursor.set(pageNo, i + 1);
    notes.push(footnotes.get(pageNo)?.[i] ?? null);
    return ` ⟦${notes.length - 1}⟧`;
  });
  const stripMarkers = (t) => t.replace(MARKER, '').replace(/\s+/g, ' ').trim();

  // Fallback for headings the TOC lacks or the matcher missed: printed headings are
  // short Title-Case lines with no closing punctuation, after the end of a narration
  // and before ordinary body text (body lines run ~80 characters).
  const SHORT = 64;
  const titleish = (t) => {
    const words = t.split(/\s+/).filter((w) => /^[A-Za-z]{4,}/.test(w));
    const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
    return words.length > 0 && caps / words.length >= 0.6;
  };
  function guessHeading(i) {
    let p = i - 1;
    if (p >= 0 && body[p].raw) return null; // must follow a blank line
    while (p >= 0 && !body[p].raw) p--;
    if (p >= 0 && !/[.!?"'”)}\]^*]\s*$|\d\)?\s*$/.test(body[p].raw) && !startAt.has(p)) return null;
    const parts = [];
    let k = i;
    while (k < body.length && parts.length < 4) {
      if (!body[k].raw) { k++; continue; }
      if (startAt.has(k)) break;
      const t = stripMarkers(cleanLine(body[k].raw, vocab));
      if (t.length > SHORT || !titleish(t)) break;
      parts.push(t);
      k++;
    }
    if (!parts.length) return null;
    let n = k;
    while (n < body.length && !body[n].raw) n++;
    if (n >= body.length || body[n].raw.length < 60) return null; // must be followed by body text
    const title = parts.join(' ');
    if (title.length < 12 || title.length > 220) return null;
    if (!/^[A-Z"]/.test(title) || /[.,;:!?"'”)]$/.test(title) || /"/.test(title)) return null;
    if (/\b(narrates|reports|said|says|states|replied)\b/.test(title)) return null;
    // sentence fragments, not headings
    if (/:/.test(title) || /\b(who|a|an|and|the|of|to|at|in|was|with|Hadhrat|Surah|he|his|her|that)$/.test(title)) return null;
    if (/^(However|When|It |O |From |Muhammad |Sa'eed )/.test(title)) return null;
    let span = k - i;
    while (span > 1 && !body[i + span - 1].raw) span--;
    return { title, span };
  }

  const events = []; // {type:'chapter'|'heading'|'line'|'blank', ...}
  for (let i = 0; i < body.length; i++) {
    if (!body[i].raw) { events.push({ type: 'blank' }); continue; }
    const hit = startAt.get(i);
    if (hit) {
      let title = null;
      if (!hit.chapter) {
        // The heading as printed in the body has fewer typos than the TOC ("Manking",
        // "Wordl"), so prefer it unless it came out much worse.
        const printed = stripMarkers(body.slice(i, i + hit.span).filter((b) => b.raw)
          .map((b) => cleanLine(b.raw, vocab)).join(' '));
        const listed = cleanLine(toc[hit.entry].title, vocab).replace(/\s+[A-Z]$/, '');
        title = similarity(key(printed), toc[hit.entry].key) >= 0.85 ? printed : listed;
      }
      events.push(hit.chapter
        ? { type: 'chapter', n: hit.chapter, page: body[i].page }
        : { type: 'heading', title, page: body[i].page });
      i += hit.span - 1;
      continue;
    }
    const guess = guessHeading(i);
    if (guess) {
      events.push({ type: 'heading', title: guess.title, page: body[i].page });
      (report.guessed ??= []).push(`v${vol} p${body[i].page}: ${guess.title}`);
      i += guess.span - 1;
      continue;
    }
    // "{Surah Hood, verse 105}" uses braces, which the junk filter would eat
    const raw = body[i].raw
      // misread reference numbers: head.m(2) -> head." (2);  Hadith."(l) -> Hadith." (1)
      .replace(/([.!?)])[mnl]\((\d{1,2})\)/g, '$1" ($2)').replace(/\(([lIi])\)/g, '(1)')
      .replace(/\{\s*(Surah[^{}]*)\}/g, '($1)').replace(/\{\s*(Surah)/g, '($1').replace(/(\d)\s*\}/g, '$1)');
    // decide on noise before markers are resolved, so a dropped line never uses up a note;
    // a short line holding only a verse number and a marker ("5-8}'1'") is kept
    const bare = raw.replace(MARKER, '');
    const onlyRef = bare !== raw && /^[\d\s,.\-–)(]*$/.test(bare);
    // The last short line of a sentence ("careless." '2)) is kept when the line before it
    // stopped mid-sentence, even if its word is too rare to be in the vocabulary.
    const prevLine = [...events].reverse().find((e) => e.type === 'line');
    const continues = prevLine && !/[.!?"'”)\]:;]\s*(⟦\d+⟧)?\s*$/.test(prevLine.text)
      && /^["'‘“(]?[A-Za-z][a-z]{2,}/.test(cleanLine(bare, vocab));
    if (!onlyRef && !continues && isNoiseLine(cleanLine(bare, vocab), vocab)) {
      const c = cleanLine(bare, vocab);
      if (c.split(/\s+/).filter((w) => /^[A-Za-z]{3,}$/.test(w)).length >= 3) (report.droppedLines ??= []).push({ vol, page: body[i].page, text: c.slice(0, 100) });
      continue;
    }
    events.push({ type: 'line', text: cleanLine(withMarkers(raw, body[i].page), vocab), page: body[i].page });
  }

  // ---- 3. structure + paragraphs --------------------------------------------------
  const chapters = [];
  let chapter = null;
  let section = null;
  let topic = null;
  let para = null; // {text, pages:Set}
  let blankSeen = false;
  const sections = [];

  const endPara = () => {
    if (!para) return;
    const target = section ?? chapter;
    if (target) (target.paras ??= []).push(para);
    para = null;
  };
  for (let k = 0; k < events.length; k++) {
    const ev = events[k];
    if (ev.type === 'blank') { blankSeen = true; continue; }
    if (ev.type === 'chapter') {
      endPara();
      chapter = { vol, n: ev.n, title: null, page: ev.page, paras: [] };
      chapters.push(chapter);
      section = null; topic = null;
      continue;
    }
    if (ev.type === 'heading') {
      endPara();
      if (chapter && !chapter.title && /^The\s+Chapter/i.test(ev.title)) { chapter.title = ev.title; continue; }
      if (chapter && !chapter.title) chapter.title = `Chapter ${chapter.n}`;
      // a heading directly followed by another heading is a topic (parent) heading
      const nextReal = events.slice(k + 1).find((e) => e.type !== 'blank');
      const isTopic = nextReal?.type === 'heading';
      section = { chapter, title: ev.title, page: ev.page, level: isTopic ? 1 : 2, parent: isTopic ? null : topic, paras: [] };
      if (isTopic) topic = section;
      sections.push(section);
      continue;
    }
    // line
    if (chapter && !chapter.title && !section) {
      // title printed in the body but missing from the TOC: "The Chapter Concerning ..."
      if (/^The\s+Chapter/i.test(ev.text) || chapter.titleOpen) {
        chapter.title = null;
        chapter.titleText = `${chapter.titleText ?? ''} ${ev.text}`.trim();
        chapter.titleOpen = !blankSeen && chapter.titleText.length < 90;
        const nxt = events[k + 1];
        if (!nxt || nxt.type !== 'line') { chapter.title = chapter.titleText; delete chapter.titleOpen; }
        blankSeen = false;
        continue;
      }
    }
    const prevText = para?.text ?? '';
    const breakHere = para && blankSeen && (
      prevText.length && /[.!?"'”)}\]]$|ﷺ$/.test(prevText) && /^[A-Z"'“(]/.test(ev.text)
    );
    if (!para || breakHere) {
      endPara();
      para = { text: ev.text, page: ev.page };
    } else if (/[A-Za-z]-$/.test(prevText) && /^[a-z]/.test(ev.text)) {
      para.text = prevText.slice(0, -1) + ev.text;
    } else {
      para.text = `${prevText} ${ev.text}`;
    }
    blankSeen = false;
  }
  endPara();

  // ---- 4. narrations: a narration ends at its reference marker ---------------------
  for (const p of [...chapters.flatMap((c) => c.paras), ...sections.flatMap((x) => x.paras)]) {
    p.text = p.text.replace(/\s+/g, ' ').trim();
  }

  // Tidy a narration's last paragraph: drop trailing scan debris ("^", "<", ",,", a lone
  // capital) and restore the full stop the honorific glyph swallowed ("...with Hadhrat Abu Bakr").
  const tidyEnd = (t) => {
    let x = t.replace(/(\s*([®™*^<>|•~]|'!'|["'‘’”]{2,}\*?|\(\s*[A-Za-z]?\s*\*?|\s[A-Z]\b|\(\d\)?))+\s*$/, '').replace(/(\s+(\^|<|>|'!'|['‘’]|[A-Z]|\(\s*))+\s*$/, '').replace(/[.,]{2,}$/, '.').replace(/,$/, '.').trim();
    if (/([A-Za-z]|ﷺ|\(RA\))$/.test(x) && /(\b[A-Z][a-z'’]+|ﷺ|\(RA\))$/.test(x)) x += '.';
    return x;
  };
  const toNarrations = (paras) => {
    const out = [];
    let cur = null;
    const close = () => { if (cur && cur.paras.length) out.push(cur); cur = null; };
    for (const p of paras) {
      // split a paragraph where a marker is followed straight away by a new narration
      const pieces = p.text.split(/(?<=⟦\d+⟧)\s+(?=(?:Hadhrat|Another|A\s+(?:similar\s+)?(?:narration|report)|In\s+another)\b)/);
      for (const piece of pieces) {
        cur ??= { paras: [], sources: [], page: p.page };
        const text = piece.replace(/ ?⟦(\d+)⟧/g, (_, i) => {
          const note = notes[Number(i)];
          if (note) cur.sources.push(note);
          return '';
        }).trim();
        // a short paragraph that is a source reference belongs with the references
        if (text && text.length < 300 && /^[A-Z][A-Za-z' ]{2,30}\b.{0,140}\b(Vol|Pg)\b/.test(text) && REFERENCE.test(text)) cur.sources.push(text);
        else if (text && /[A-Za-z].*[A-Za-z].*[A-Za-z]/.test(text)) cur.paras.push(text);
        if (/⟦\d+⟧\s*$/.test(piece)) close();
      }
    }
    close();
    for (const n of out) n.paras[n.paras.length - 1] = tidyEnd(n.paras[n.paras.length - 1]);
    return out;
  };

  for (const c of chapters) {
    c.intro = c.paras.map((p) => p.text.replace(/ ?⟦\d+⟧/g, '')).filter((t) => t.length > 40);
    delete c.paras;
  }
  for (const s of sections) {
    s.narrations = toNarrations(s.paras);
    delete s.paras;
  }
  report.footnotePages += footnotes.size;
  return { chapters, sections };
}

// Chapter titles the OCR breaks across lines or leaves out of the body (checked by hand
// against the tables of contents).
const CHAPTER_TITLE_FIXES = {
  4: 'The Chapter Concerning Hijrah (Migration)',
  9: 'The Chapter About How the Sahabah (RA) Relinquished their Carnal Desires',
  12: 'The Chapter Concerning the Sahabah (RA) Getting Together for Salaah',
};

// ---------------------------------------------------------------------------------
const texts = await Promise.all([1, 2, 3].map((p) => readFile(new URL(`part${p}.txt`, RAW), 'utf8')));
const vocab = buildVocab(texts.join('\n'));
const report = { missedHeadings: [], footnotePages: 0 };

const book = { title: 'The Lives of the Sahabah', volumes: [], chapters: [], sections: [], narrations: [] };
let pos = 0;
for (const [i, text] of texts.entries()) {
  const vol = i + 1;
  const { chapters, sections } = segmentVolume(vol, text, vocab, report);
  book.volumes.push({ n: vol, title: `Volume ${vol}`, chapters: chapters.map((c) => c.n) });
  for (const c of chapters) {
    const cid = `c${String(c.n).padStart(2, '0')}`;
    book.chapters.push({ id: cid, vol, n: c.n, title: CHAPTER_TITLE_FIXES[c.n] ?? c.title, page: c.page, intro: c.intro });
    let sNo = 0;
    for (const s of sections.filter((x) => x.chapter === c)) {
      s.id = `${cid}-s${String(++sNo).padStart(3, '0')}`;
      book.sections.push({ id: s.id, chapter: cid, parent: s.parent?.id ?? null, level: s.level, title: s.title, page: s.page });
      for (const n of s.narrations) {
        pos++;
        book.narrations.push({
          id: `n${String(pos).padStart(5, '0')}`,
          pos, vol, chapter: cid, section: s.id, page: n.page,
          paras: n.paras, sources: n.sources,
        });
      }
    }
  }
}

await mkdir(OUT, { recursive: true });
await writeFile(new URL('book.json', OUT), JSON.stringify(book));
const words = book.narrations.reduce((a, n) => a + n.paras.join(' ').split(/\s+/).length, 0);
console.log({
  chapters: book.chapters.length,
  sections: book.sections.length,
  narrations: book.narrations.length,
  words,
  withSources: book.narrations.filter((n) => n.sources.length).length,
  missedHeadings: report.missedHeadings.length,
  pbuhMarks: JSON.stringify(book).split(PBUH).length - 1,
});
await writeFile(new URL('segment-report.json', OUT), JSON.stringify(report, null, 1));
