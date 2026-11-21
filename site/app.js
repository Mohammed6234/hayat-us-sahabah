// Hayat us Sahabah reader. Plain JS, no framework.
// Routes (location.hash): #home, #read, #read-c03, #read-n00120, #find, #n00120
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => esc(s)
  .replace(/ﷺ/g, '<span class="saw" title="sallallaahu alayhi wasallam">ﷺ</span>')
  .replace(/\(RA\)/g, '<span class="ra" title="radhiyallaahu anhu">(RA)</span>');
const num = (n) => n.toLocaleString('en-GB');
const plural = (n, w) => `${num(n)} ${w}${n === 1 ? '' : 's'}`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

/* ---------------------------------------------------------------- data */
let D;
const by = {};
const texts = new Map(); // chapter id -> { narration id -> {paras, sources} }

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}
async function load() {
  D = await getJSON('data/index.json');
  by.chapter = new Map(D.chapters.map((c) => [c.id, c]));
  by.section = new Map(D.sections.map((s) => [s.id, s]));
  by.person = new Map(D.people.map((p) => [p.id, p]));
  by.theme = new Map(D.themes.map((t) => [t.id, t]));
  by.nar = new Map(D.narrations.map((n, i) => [n.id, { n, i }]));
  // How many narrations each person and theme has, for the dropdowns.
  by.personCount = new Map();
  by.themeCount = new Map();
  for (const n of D.narrations) {
    for (const p of n.people ?? []) if (p.role !== 'mentioned') by.personCount.set(p.id, (by.personCount.get(p.id) ?? 0) + 1);
    for (const t of n.themes ?? []) by.themeCount.set(t, (by.themeCount.get(t) ?? 0) + 1);
  }
}
async function chapterText(id) {
  if (!texts.has(id)) texts.set(id, await getJSON(`data/text-${id}.json`));
  return texts.get(id);
}
let allTextLoading;
function loadAllText() {
  allTextLoading ??= Promise.all(D.chapters.map((c) => chapterText(c.id))).then(() => {
    for (const n of D.narrations) {
      const t = texts.get(n.chapter)[n.id];
      n.full = `${t.paras.join(' ')} ${n.summary ?? ''}`.toLowerCase();
    }
  });
  return allTextLoading;
}

/* -------------------------------------------------------------- finder */
const find = { person: '', theme: '', q: '', mentions: false, shown: 25 };

function matches(n) {
  if (find.person) {
    const ok = (n.people ?? []).some((p) => p.id === find.person && (find.mentions || p.role !== 'mentioned'));
    if (!ok) return false;
  }
  if (find.theme && !(n.themes ?? []).includes(find.theme)) return false;
  if (find.q) {
    const hay = n.full ?? `${n.excerpt} ${n.summary ?? ''}`.toLowerCase();
    for (const w of find.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!hay.includes(w)) return false;
  }
  return true;
}
function finderHtml({ submit }) {
  const opt = (id, label, count, sel) => `<option value="${esc(id)}"${sel ? ' selected' : ''}>${esc(label)}${count ? ` (${count})` : ''}</option>`;
  const groups = [...new Set(D.themes.map((t) => t.group))];
  return `<form class="finder" id="finder">
    ${submit ? '<h2>Find narrations</h2>' : ''}
    <div class="finder-row">
      <div class="field"><label for="f-person-q">Companion</label>
        <div class="combo" id="person-combo">
          <input id="f-person-q" type="text" role="combobox" aria-expanded="false" aria-controls="person-list" aria-autocomplete="list"
            placeholder="Choose or type a name" autocomplete="off" spellcheck="false" value="${esc(by.person.get(find.person)?.name ?? '')}">
          <input id="f-person" type="hidden" value="${esc(find.person)}">
          <button type="button" class="combo-clear" id="person-clear" aria-label="Clear companion"${find.person ? '' : ' hidden'}>×</button>
          <span class="combo-caret" aria-hidden="true"></span>
          <ul id="person-list" class="combo-list" role="listbox" aria-label="Companions" hidden></ul>
        </div></div>
      <div class="field"><label for="f-theme">Theme</label>
        <select id="f-theme"><option value="">Any theme</option>
          ${groups.map((g) => `<optgroup label="${esc(g)}">${D.themes.filter((t) => t.group === g)
            .map((t) => opt(t.id, t.name, by.themeCount.get(t.id), t.id === find.theme)).join('')}</optgroup>`).join('')}
        </select></div>
    </div>
    <div class="field"><label for="f-q">Words in the text</label>
      <input id="f-q" type="search" value="${esc(find.q)}" placeholder="e.g. Khaybar, patience, Abu Taalib" autocomplete="off"></div>
    <div class="finder-actions">
      <label class="check"><input type="checkbox" id="f-mentions"${find.mentions ? ' checked' : ''}> Include passing mentions</label>
      ${submit ? '<button class="btn btn-primary" type="submit">Find</button>' : ''}
    </div>
  </form>`;
}
function readFinder() {
  find.person = $('#f-person').value;
  find.theme = $('#f-theme').value;
  find.q = $('#f-q').value.trim();
  find.mentions = $('#f-mentions').checked;
  find.shown = 25;
}
function syncQuery() {
  if (embedded) return; // inside a preview only a plain #name survives
  const q = new URLSearchParams();
  if (find.person) q.set('person', find.person);
  if (find.theme) q.set('theme', find.theme);
  if (find.q) q.set('q', find.q);
  history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`);
}

/* ------------------------------------------------------ companion picker */
// Spelling-tolerant: "Aisha", "Aaisha", "Omar" and "Umar" all find the right person.
const fold = (x) => String(x).toLowerCase().replace(/['’`]/g, '').replace(/-/g, ' ')
  .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/([bcdfgjklmnpqrstvwxz])h/g, '$1')
  .replace(/(.)\1+/g, '$1').replace(/o/g, 'u').replace(/e/g, 'i').replace(/\s+/g, ' ').trim();
let personIndex;
const letterOf = (name) => (name.match(/[A-Za-z]/)?.[0] ?? '#').toUpperCase();
const index = () => (personIndex ??= D.people.filter((p) => by.personCount.get(p.id)).map((p) => ({ p, key: fold(p.name), n: by.personCount.get(p.id) })));

// With nothing typed: the whole list, A–Z, with a shortcut to the most-narrated at the top.
function browsePeople() {
  const byName = (a, b) => a.p.name.localeCompare(b.p.name);
  const comp = index().filter((x) => x.p.sahabi !== 'no').sort(byName);
  const others = index().filter((x) => x.p.sahabi === 'no').sort(byName);
  const rows = [], items = [];
  const add = (x) => { rows.push({ i: items.length }); items.push(x.p); };
  const group = (list) => { let cur = ''; for (const x of list) { const l = letterOf(x.p.name); if (l !== cur) { cur = l; rows.push({ head: l, cls: 'po-letter' }); } add(x); } };
  rows.push({ head: 'Most narrations', cls: 'po-hint' });
  comp.slice().sort((a, b) => b.n - a.n).slice(0, 12).forEach(add);
  rows.push({ head: `All companions, A–Z (${comp.length})`, cls: 'po-hint' });
  group(comp);
  if (others.length) { rows.push({ head: `Others in the book, A–Z (${others.length})`, cls: 'po-hint' }); group(others); }
  return { rows, items };
}
function searchPeople(q) {
  const k = fold(q);
  // "ibn Abbas" finds "Abdullaah bin Abbaas": the family words are optional
  const words = k.split(' ').filter((w) => !['ibn', 'bin', 'bint', 'binti'].includes(w));
  if (!words.length) return [];
  return index().filter((x) => words.every((w) => x.key.includes(w)))
    .map((x) => ({ ...x, rank: x.key.startsWith(words.join(' ')) ? 0 : x.key.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || b.n - a.n).slice(0, 60).map((x) => x.p);
}
function initPersonPicker() {
  const q = $('#f-person-q'), hid = $('#f-person'), list = $('#person-list'), clear = $('#person-clear');
  if (!q) return;
  let items = [], active = -1;
  const fire = () => hid.dispatchEvent(new Event('change', { bubbles: true }));
  const open = () => { list.hidden = false; q.setAttribute('aria-expanded', 'true'); };
  const close = () => { list.hidden = true; q.setAttribute('aria-expanded', 'false'); };
  const opt = (p, i) => `<li role="option" id="po-${i}" data-i="${i}" aria-selected="false"><span class="po-name">${esc(p.name)}</span><span class="po-meta">${p.sahabi === 'no' ? 'not a Sahabi · ' : ''}${by.personCount.get(p.id)}</span></li>`;
  const setActive = (i, scroll) => {
    active = i;
    list.querySelectorAll('li[data-i]').forEach((li) => { const on = Number(li.dataset.i) === i; li.classList.toggle('on', on); li.setAttribute('aria-selected', String(on)); });
    const el = list.querySelector('li.on');
    q.setAttribute('aria-activedescendant', el ? el.id : '');
    if (el && scroll === 'key') el.scrollIntoView({ block: 'nearest' });
    if (el && scroll === 'centre') list.scrollTop = Math.max(0, el.offsetTop - list.clientHeight / 2);
  };
  const draw = () => {
    const query = hid.value ? '' : q.value;
    if (!fold(query)) {                       // browsing: everyone, A–Z
      const res = browsePeople();
      items = res.items;
      list.innerHTML = res.rows.map((r) => (r.head !== undefined ? `<li class="${r.cls}" aria-hidden="true">${esc(r.head)}</li>` : opt(items[r.i], r.i))).join('');
      const sel = hid.value ? items.findIndex((p, i) => p.id === hid.value && i >= 12) : -1;
      setActive(sel, 'centre');
    } else {                                  // searching
      items = searchPeople(query);
      list.innerHTML = items.length ? `<li class="po-hint" aria-hidden="true">${items.length} match${items.length === 1 ? '' : 'es'}</li>${items.map(opt).join('')}`
        : '<li class="po-hint">No companion matches. Try another spelling.</li>';
      setActive(items.length ? 0 : -1);
    }
  };
  const pick = (p) => { hid.value = p.id; q.value = p.name; clear.hidden = false; close(); fire(); };
  q.addEventListener('input', () => {
    if (hid.value) { hid.value = ''; clear.hidden = true; fire(); }
    draw(); open();
  });
  q.addEventListener('focus', () => { if (hid.value) q.select(); draw(); open(); });
  q.addEventListener('click', () => { if (list.hidden) { draw(); open(); } });
  q.addEventListener('blur', close);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) { draw(); open(); }
      const n = items.length;
      if (n) setActive(e.key === 'ArrowDown' ? (active + 1) % n : active < 0 ? n - 1 : (active - 1 + n) % n, 'key');
    } else if (e.key === 'Enter' && !list.hidden && items.length && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') close();
  });
  // mousedown (not click) so the input does not lose focus before the pick lands
  list.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const li = e.target.closest('li[data-i]');
    if (li) pick(items[Number(li.dataset.i)]);
  });
  clear.addEventListener('click', () => { q.value = ''; hid.value = ''; clear.hidden = true; fire(); q.focus(); });
}

/* ---------------------------------------------------------------- home */
function renderHome() {
  const last = store.get('hus:last');
  const lastN = last && by.nar.get(last);
  app.innerHTML = `
    <section class="intro">
      <h1>The Lives of the Sahabah</h1>
      <p>By ${esc(D.book.author)} · ${D.book.volumes.length} volumes · ${plural(D.narrations.length, 'narration')}</p>
    </section>
    ${finderHtml({ submit: true })}
    <div class="or">
      <a class="btn" href="#read">${lastN ? 'Read from the beginning' : 'Start reading'}</a>
      ${lastN ? `<a class="btn btn-primary" href="#read-${esc(last)}">Continue reading</a>` : ''}
    </div>
    <section class="contents" aria-label="Contents">
      ${D.book.volumes.map((v) => `<div class="vol-block v${v.n}"><h2>Volume ${v.n}</h2><ol>${D.chapters.filter((c) => c.vol === v.n).map((c) =>
        `<li><a href="#read-${c.id}"><span class="no">${c.n}</span><span>${fmt(c.title)}</span></a></li>`).join('')}</ol></div>`).join('')}
    </section>`;
  initPersonPicker();
  $('#finder').addEventListener('submit', (e) => {
    e.preventDefault();
    readFinder();
    location.hash = 'find';
  });
}

/* ---------------------------------------------------------------- find */
function renderFind() {
  app.innerHTML = `<h1 class="page-title">Find narrations</h1>
    ${finderHtml({ submit: false })}
    <div id="found" aria-live="polite"></div>`;
  initPersonPicker();
  const form = $('#finder');
  let t;
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => { readFinder(); updateFind(); });
  $('#f-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { readFinder(); updateFind(); }, 200); });
  updateFind();
}
async function updateFind() {
  const out = $('#found');
  if (!out) return;
  syncQuery();
  if (!find.person && !find.theme && !find.q) {
    const topPeople = [...by.personCount].filter(([id]) => by.person.get(id)?.sahabi === 'yes').sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topThemes = [...by.themeCount].sort((a, b) => b[1] - a[1]).slice(0, 10);
    out.innerHTML = `<div class="hint">
      <p class="count">Choose a Companion, a theme, or both. ${D.book.tagged < D.narrations.length ? `So far ${num(D.book.tagged)} of ${num(D.narrations.length)} narrations have been tagged; the rest can still be found by searching their words.` : ''}</p>
      ${topPeople.length ? `<h3>Companions</h3><div class="picks">${topPeople.map(([id, c]) => `<button class="pick" type="button" data-pick-person="${esc(id)}">${esc(by.person.get(id).name)} · ${c}</button>`).join('')}</div>` : ''}
      ${topThemes.length ? `<h3>Themes</h3><div class="picks">${topThemes.map(([id, c]) => `<button class="pick" type="button" data-pick-theme="${esc(id)}">${esc(by.theme.get(id).name)} · ${c}</button>`).join('')}</div>` : ''}
    </div>`;
    return;
  }
  if (find.q && !D.narrations[0].full) {
    out.innerHTML = '<p class="loading">Searching the full text…</p>';
    await loadAllText();
    if (!$('#found')) return;
  }
  const hits = D.narrations.filter(matches);
  const parts = [];
  if (find.person) parts.push(`about <b>${esc(by.person.get(find.person)?.name)}</b>`);
  if (find.theme) parts.push(`on <b>${esc(by.theme.get(find.theme)?.name)}</b>`);
  if (find.q) parts.push(`containing <b>“${esc(find.q)}”</b>`);
  const words = find.q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const mark = (html) => words.reduce((h, w) => h.replace(new RegExp(`(?![^<]*>)(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'), html);
  out.innerHTML = `<p class="count"><b>${plural(hits.length, 'narration')}</b> ${parts.join(' ')}</p>
    ${hits.slice(0, find.shown).map((n) => {
      const s = by.section.get(n.section);
      const c = by.chapter.get(n.chapter);
      return `<article class="result v${c.vol}">
        <div class="where"><span class="num">Narration ${n.pos}</span> Volume ${c.vol} · Chapter ${WORDS[c.n]} · page ${n.page}</div>
        <h3><a href="#${n.id}">${fmt(s.title)}</a></h3>
        <p>${mark(fmt(n.excerpt))}</p>
        ${tagLinks(n, 3)}
      </article>`;
    }).join('')}
    ${hits.length > find.shown ? `<div class="more"><button class="btn" type="button" data-more>Show ${Math.min(25, hits.length - find.shown)} more</button></div>` : ''}
    ${!hits.length ? '<p>Nothing matches. Try “Any theme”, tick “Include passing mentions”, or use fewer words.</p>' : ''}`;
}

/* ---------------------------------------------------------------- read */
let readObserver;
function tagLinks(n, max = 99) {
  const people = (n.people ?? []).filter((p) => p.role !== 'mentioned').map((p) => by.person.get(p.id)).filter(Boolean).slice(0, max);
  const themes = (n.themes ?? []).map((t) => by.theme.get(t)).filter(Boolean).slice(0, max);
  if (!people.length && !themes.length) return '';
  return `<div class="tags">${people.map((p) => `<a class="chip chip-person" href="#find" data-pick-person="${esc(p.id)}">${esc(p.name)}</a>`).join('')}${themes.map((t) => `<a class="chip chip-theme" href="#find" data-pick-theme="${esc(t.id)}">${esc(t.name)}</a>`).join('')}</div>`;
}
function refs(t) {
  return t.sources.length ? `<details class="refs"><summary>References</summary><ol>${t.sources.map((s) => `<li>${fmt(s)}</li>`).join('')}</ol></details>` : '';
}
function narHtml(n, t) {
  return `<article class="nar ${n.pos % 2 ? 'odd' : 'even'}" id="${n.id}">
    <div class="nar-head"><a class="num" href="#${n.id}" title="Open this narration on its own">Narration ${n.pos}</a><span class="pg">page ${n.page}</span></div>
    <div class="nar-text">${t.paras.map((p) => `<p>${fmt(p)}</p>`).join('')}</div>
    ${tagLinks(n)}${refs(t)}
  </article>`;
}
async function renderRead(target) {
  let chapterId = D.chapters[0].id;
  let scrollTo = null;
  if (target && by.chapter.has(target)) chapterId = target;
  else if (target && by.nar.has(target)) { chapterId = by.nar.get(target).n.chapter; scrollTo = target; }
  const c = by.chapter.get(chapterId);
  app.dataset.vol = c.vol;
  const ci = D.chapters.indexOf(c);
  const prev = D.chapters[ci - 1];
  const next = D.chapters[ci + 1];
  app.innerHTML = `<div class="chapter-nav">
      <div class="field"><label for="ch">Chapter</label><select id="ch">${D.book.volumes.map((v) => `<optgroup label="Volume ${v.n}">${D.chapters.filter((x) => x.vol === v.n)
        .map((x) => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${x.n}. ${esc(x.title.replace(/^The Chapter (Concerning|About) /i, ''))}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <a class="btn" href="#read-${prev?.id ?? ''}" aria-label="Previous chapter"${prev ? '' : ' hidden'}>‹</a>
      <a class="btn" href="#read-${next?.id ?? ''}" aria-label="Next chapter"${next ? '' : ' hidden'}>›</a>
    </div>
    <header class="chapter-head v${c.vol}"><p class="vol">Volume ${c.vol} · Chapter ${WORDS[c.n]}</p><h1>${fmt(c.title)}</h1>
      ${(c.intro ?? []).map((p) => `<p>${fmt(p)}</p>`).join('')}</header>
    <div id="chapter-body"><p class="loading">Loading the chapter…</p></div>
    ${next ? `<div class="more"><a class="btn btn-primary" href="#read-${next.id}">Next: Chapter ${WORDS[next.n]}</a></div>` : ''}`;
  $('#ch').addEventListener('change', (e) => { location.hash = `read-${e.target.value}`; });
  if (!scrollTo) window.scrollTo(0, 0);

  const text = await chapterText(c.id);
  if (!$('#chapter-body')) return;
  const html = [];
  for (const s of D.sections.filter((x) => x.chapter === c.id)) {
    html.push(s.level === 1 ? `<h2 class="topic" id="${s.id}">${fmt(s.title)}</h2>` : `<h3 class="sec" id="${s.id}">${fmt(s.title)}</h3>`);
    for (const n of D.narrations.filter((x) => x.section === s.id)) html.push(narHtml(n, text[n.id]));
  }
  $('#chapter-body').innerHTML = html.join('');
  readObserver?.disconnect();
  readObserver = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) store.set('hus:last', e.target.id); }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('#chapter-body .nar').forEach((el) => readObserver.observe(el));
  if (scrollTo) {
    const el = document.getElementById(scrollTo);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); }
  }
}

/* ---------------------------------------------------------- one narration */
async function renderOne(id) {
  const hit = by.nar.get(id);
  if (!hit) { app.innerHTML = '<p>That narration was not found. <a href="#read">Go to the book</a>.</p>'; return; }
  const { n, i } = hit;
  const s = by.section.get(n.section);
  const c = by.chapter.get(n.chapter);
  app.dataset.vol = c.vol;
  app.innerHTML = '<p class="loading">Loading…</p>';
  const t = (await chapterText(n.chapter))[n.id];
  const prev = D.narrations[i - 1];
  const next = D.narrations[i + 1];
  const link = (x, cls, label) => x ? `<a class="${cls}" href="#${x.id}"><small>${label}</small><span>${fmt(by.section.get(x.section).title)}</span></a>` : '<span></span>';
  app.innerHTML = `<article class="single">
    <p class="crumb"><a href="#read-${c.id}">Volume ${c.vol}, Chapter ${WORDS[c.n]}</a></p>
    <h1>${fmt(s.title)}</h1>
    ${narHtml(n, t)}
    ${n.summary ? `<p class="summary">Summary (machine-written, not yet checked): ${fmt(n.summary)}</p>` : ''}
    <p><a class="btn" href="#read-${n.id}">Read it in the book</a></p>
    <nav class="pager" aria-label="Previous and next">${link(prev, 'prev', '‹ Previous')}${link(next, 'next', 'Next ›')}</nav>
  </article>`;
  window.scrollTo(0, 0);
}

/* -------------------------------------------------------------- routing */
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  delete app.dataset.vol;
  const view = h === 'read' || h.startsWith('read-') ? 'read' : h === 'find' ? 'find' : /^n\d{5}$/.test(h) ? 'one' : 'home';
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (view === 'home') { renderHome(); window.scrollTo(0, 0); }
  else if (view === 'find') { renderFind(); window.scrollTo(0, 0); }
  else if (view === 'read') renderRead(h.startsWith('read-') ? h.slice(5) : null);
  else renderOne(h);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-pick-person], [data-pick-theme], [data-more]');
  if (!el) return;
  if (el.hasAttribute('data-more')) { find.shown += 25; updateFind(); return; }
  Object.assign(find, { person: el.dataset.pickPerson ?? '', theme: el.dataset.pickTheme ?? '', q: '', shown: 25 });
  if (location.hash === '#find') { e.preventDefault(); renderFind(); window.scrollTo(0, 0); }
  else location.hash = 'find';
});
window.addEventListener('hashchange', route);

load().then(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('person') || q.get('theme') || q.get('q')) {
    Object.assign(find, { person: q.get('person') ?? '', theme: q.get('theme') ?? '', q: q.get('q') ?? '' });
    if (!location.hash) location.hash = 'find';
  }
  $('#foot-status').textContent = D.book.tagged < D.narrations.length
    ? `Tagging in progress: ${num(D.book.tagged)} of ${num(D.narrations.length)} narrations tagged so far. Tags are machine-made and not yet checked.`
    : 'Tags are machine-made and not yet checked.';
  route();
}).catch((err) => {
  app.innerHTML = `<p>The book could not be loaded (${esc(err.message)}). Reload the page to try again.</p>`;
});
