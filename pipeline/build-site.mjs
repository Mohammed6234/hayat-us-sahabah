// Packages site/ as a standalone static site in dist/ (any static host:
// Cloudflare Pages, Netlify, GitHub Pages). site/index.html is written as page
// content without <html>/<head>/<body> so the same file can be published as a
// preview artifact; this wraps it in a full document.
import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises';

const src = (p) => new URL(`../site/${p}`, import.meta.url);
const out = (p) => new URL(`../dist/${p}`, import.meta.url);
await rm(out(''), { recursive: true, force: true });
await mkdir(out(''), { recursive: true });

const page = await readFile(src('index.html'), 'utf8');
const split = page.indexOf('<header');
const head = page.slice(0, split).trim();
const body = page.slice(split).trim();
await writeFile(out('index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`);
for (const f of ['app.js', 'styles.css']) await copyFile(src(f), out(f));
await mkdir(out('data/'), { recursive: true });
for (const f of await readdir(src('data/'))) await copyFile(src(`data/${f}`), out(`data/${f}`));
console.log('dist/ ready');
