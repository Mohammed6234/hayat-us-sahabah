// OCR clean-up helpers shared by the segmenter.
//
// The scan renders the calligraphic honorifics (ﷺ after the Prophet's name, the
// "radhiyallahu anhu" glyph after a Sahabi's) as junk tokens such as "&§", "{Jl^i",
// "5g»2®e>". We drop those tokens and put back a clean marker where we can tell
// which honorific it was.

export const PBUH = 'ﷺ';
export const RA = '(RA)';

const SYMBOLS = /[&§®@$£{}^%*#~|<>»«©¥¢™+=\[\]\\]/g;
const PROPHET = /^(Rasulullaah|Rasoolullaah|Nabi|Rasool|Muhammad)('s)?$/;

// Every lowercase word that occurs a few times in the corpus is treated as real
// English. Anything else straight after "Rasulullaah" is a mangled ﷺ.
export function buildVocab(text) {
  const counts = new Map();
  for (const w of text.match(/(?<![A-Za-z])[a-z][a-z']+(?![A-Za-z])/g) ?? []) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const vocab = new Set();
  // a vowel is required so repeated OCR garbage ("jt", "jj") never becomes a "word"
  for (const [w, n] of counts) if (n >= 5 && /[aeiouy]/.test(w)) vocab.add(w);
  return vocab;
}

const symbolCount = (t) => (t.match(SYMBOLS) ?? []).length;
const core = (t) => t.replace(/^[("'‘“]+/, '').replace(/[.,;:!?"'’”)]+$/, '');

function isJunk(tok, prev, vocab) {
  const c = core(tok);
  if (!c || /^⟦\d+⟧$/.test(c)) return false; // footnote placeholder
  if (symbolCount(c) >= 2) return true;
  // letter-only junk such as "SSSSSSg", "SUSSSsi", "WM" (real words never look like this)
  const bare = c.replace(/'s$/, '');
  if (/^[A-Za-z0-9]+$/.test(bare) && !/^(RA|SAW|AH|II|III|IV|O|I|A)$/.test(bare)
      && (/[A-Z]{2,}/.test(bare) || /\d/.test(bare) && /[A-Za-z]/.test(bare) || /[a-z][A-Z]/.test(bare))) return true;
  if (symbolCount(c) === 1 && /[A-Za-z0-9]/.test(c)) return true;
  if (prev && PROPHET.test(core(prev))) {
    const w = c.replace(/'s$/, '').toLowerCase();
    return !vocab.has(w) && !/^[a-z]/.test(c);
  }
  return false;
}

// Strip honorific junk from one line, inserting ﷺ / (RA) where the context says which.
export function cleanLine(line, vocab) {
  const toks = line.trim()
    .replace(/\b(of|to|the|and|in|by|for)([A-Z][a-z])/g, '$1 $2') // "ofKhaybar"
    .replace(/([a-z])\/([A-Z])/g, '$1 $2')                         // "of/Rasulullaah"
    .replace(/\b([A-Z])\s+([a-z]{2,})\b/g, (m, a, b) => (vocab.has((a + b).toLowerCase()) && !vocab.has(b) ? a + b : m)) // "L ove"
    .split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const prev = out[out.length - 1];
    if (!isJunk(tok, prev, vocab)) { out.push(tok); continue; }
    // A real word glued to marker debris (me."*1'  hide."(1)): keep the word part.
    const glued = tok.match(/^(["'‘“(]?[A-Za-z][A-Za-z'’-]*[.,;:!?]*["'’”)]*)[^A-Za-z\s]+\S*$/);
    if (glued && vocab.has(core(glued[1]).toLowerCase().replace(/'s$/, '')) && !(prev && PROPHET.test(core(prev)))) { out.push(glued[1]); continue; }
    // keep trailing punctuation / possessive that belongs to the sentence
    // ("!", "?", ";" at the end of junk are glyph debris; "." and "," usually are not)
    const opened = out.join(' ').split('(').length - out.join(' ').split(')').length;
    const tail = (core(tok).endsWith("'s") ? "'s" : '')
      + (opened > 0 && /\)[.,]?$/.test(tok) ? ')' : '')
      + (tok.match(/[.,]$/)?.[0] ?? '');
    const window = out.slice(-6).map(core);
    let mark = '';
    if (prev && PROPHET.test(core(prev))) mark = PBUH;
    else if (window.includes('Hadhrat') || /^Sahabah$/.test(core(prev ?? ''))) mark = RA;
    // collapse consecutive junk tokens into one marker
    if (out.length && (out[out.length - 1] === PBUH || out[out.length - 1] === RA)) {
      if (tail) out[out.length - 1] += tail;
      continue;
    }
    if (mark) out.push(mark + tail);
    else if (tail && out.length) out[out.length - 1] += tail;
  }
  return out.join(' ');
}

// Garbled Arabic (Qur'aan verses) comes out as symbol soup. Drop lines where
// most tokens are not words.
export function isNoiseLine(line, vocab) {
  // split words glued together by quote marks (and"hide.") before judging the line
  const toks = line.trim().replace(/(\w)(["“”])(\w)/g, '$1 $2$3').split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  const good = toks.filter((t) => {
    const c = core(t);
    if (c === PBUH || c === '(RA)' || c === 'RA' || /^⟦\d+⟧$/.test(c)) return true;
    if (/^\d+[,.:]?$/.test(c)) return true;
    if (/^[A-Z][a-z'’-]+$/.test(c)) return true;
    return vocab.has(c.toLowerCase()) || /^(a|I|O)$/.test(c);
  }).length;
  if (toks.length <= 2) return good === 0;
  // a line with several real lowercase words is English (e.g. a line of translated poetry)
  if (toks.filter((t) => vocab.has(core(t).toLowerCase())).length >= 3) return false;
  return good / toks.length < 0.5;
}

// Letters-only form used for fuzzy heading matching.
export const norm = (s) => s.replace(SYMBOLS, ' ').toLowerCase().replace(/[^a-z]/g, '');

// Dice coefficient on character bigrams.
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = grams(a), B = grams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}
