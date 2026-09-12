#!/usr/bin/env node
/**
 * bundle-offline.js — builds ONE self-contained HTML file containing the whole
 * app: every module, the MCQ bank, flashcards, papers, the coach view and the
 * confidence model, with all CSS, JS and content embedded.
 *
 * Why: a phone cannot reach the laptop's localhost server, and file:// pages
 * are blocked from fetching JSON or ES modules. Embedding everything sidesteps
 * both. The result opens on an iPhone from Files, iCloud or an email
 * attachment, with no server, no network and no install.
 *
 * Authoring-time only. Output: John-Revision-Offline.html (single file, every
 * subject with content — the landing page and subject switching all work).
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const OUT = path.join(ROOT, 'John-Revision-Offline.html');

(async () => {
  // 1. bundle the ES modules into one classic script (no imports at runtime)
  const built = await esbuild.build({
    entryPoints: [path.join(SITE, 'app', 'js', 'main.js')],
    bundle: true, format: 'iife', write: false, target: ['safari15'],
    legalComments: 'none',
  });
  const js = built.outputFiles[0].text;

  // 2. the content the app would otherwise fetch — the registry plus every
  //    subject's files, in the shape content.js expects from __OFFLINE_CONTENT__
  const registry = JSON.parse(fs.readFileSync(path.join(SITE, 'content', 'subjects.json'), 'utf8')).subjects;
  const files = ['modules.json', 'mocks.json', 'meta.json', 'mcq.json', 'spec.json', 'reference.json'];
  const embedded = { subjects: registry, content: {} };
  for (const s of registry) {
    embedded.content[s.id] = {};
    for (const f of files) {
      embedded.content[s.id][f] = JSON.parse(fs.readFileSync(path.join(SITE, 'content', s.id, f), 'utf8'));
    }
  }

  const css = ['assets/style.css', 'app/app.css']
    .map(f => fs.readFileSync(path.join(SITE, f), 'utf8')).join('\n');

  // JSON embedded in a script tag must not contain a literal </script>
  const safeJson = JSON.stringify(embedded).replace(/<\//g, '<\\/');

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Revision — John’s GCSE app</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Revision">
<meta name="theme-color" content="#10233A">
<link rel="apple-touch-icon" href="data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#10233A"/><text x="90" y="122" font-size="96" font-family="Helvetica,Arial" fill="#F6F7F4" text-anchor="middle">R</text></svg>`)}">
<style>
${css}
/* offline build: no server, so the progress mirror and its warning are absent */
.offline-note { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); }
</style>
</head>
<body class="app-body">
<div class="app">
  <nav id="sidenav" aria-label="App navigation"></nav>
  <main id="main"></main>
</div>
<script>window.__OFFLINE_CONTENT__ = ${safeJson};</script>
<script>
${js}
</script>
<noscript><p style="padding:2rem">This page needs JavaScript enabled.</p></noscript>
</body>
</html>
`;

  fs.writeFileSync(OUT, html);
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`wrote ${path.relative(ROOT, OUT)} — ${kb} KB, one file, no server needed`);
})().catch(e => { console.error(e); process.exit(1); });
