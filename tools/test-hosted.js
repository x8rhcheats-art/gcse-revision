#!/usr/bin/env node
/**
 * test-hosted.js — checks the DEPLOYED site on a phone-sized browser:
 * it must render, save progress locally, and never call the local-only mirror.
 */
const { chromium, devices } = require('playwright');

// Point this at the deployed site:  node test-hosted.js https://<name>.pages.dev
const ORIGIN = (process.argv[2] || '').replace(/\/+$/, '');
if (!ORIGIN) {
  console.error('usage: node test-hosted.js https://<project>.pages.dev');
  process.exit(2);
}

(async () => {
  const base = `${ORIGIN}/app.html`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // an iPhone, because that is the whole point of hosting it
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = [];
  let mirrorHits = 0;
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('request', r => { if (r.url().includes('save-progress')) mirrorHits++; });

  let problems = 0;
  const check = (label, cond, detail = '') => {
    if (cond) console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
    else { problems++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  };

  console.log('\nHOSTED SIMULATION — static files only, no server endpoints\n');

  await page.goto(base + '#/home');
  await page.waitForSelector('.rowlink', { timeout: 10000 });
  check('app boots and loads its content', true);

  await page.goto(base + '#/module/06-radioactivity');
  await page.waitForSelector('.rag-dot', { timeout: 10000 });
  const dot = page.locator('.rag-dot').first();
  await dot.scrollIntoViewIfNeeded();
  await dot.hover();
  await page.click('.rag-pop .sw-red', { timeout: 5000 });
  await page.waitForTimeout(2200);
  const tags = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('physics-progress-v1') || '{}').confidence || {}).length);
  check('tagging saves in the browser', tags >= 1, `${tags} tag(s)`);
  check('no pointless requests to the local-only mirror', mirrorHits === 0, `${mirrorHits} attempts`);

  for (const [label, hash] of [['coach', '#/coach'], ['multiple choice', '#/mcq/all?n=10'],
    ['flashcards', '#/cards'], ['priority', '#/priority'], ['last sheet', '#/final'],
    ['past paper', '#/mock/paper-2025'], ['spec', '#/spec']]) {
    await page.goto(base + '#/home');
    await page.goto(base + hash);
    await page.waitForTimeout(220);
    const len = await page.evaluate(() => document.getElementById('main').textContent.trim().length);
    check(`${label} renders`, len > 50, `${len} chars`);
  }

  // the static extras the app links out to must be reachable too
  for (const f of ['complete-pack.html', 'mocks/mock-1.html', 'papers/2025-paper.pdf',
    'diagnostic/diagnostic.html', 'robots.txt']) {
    const status = await page.evaluate(async (u) => (await fetch(u)).status, f);
    check(`${f} served`, status === 200, `HTTP ${status}`);
  }

  check('no console or page errors', errs.length === 0, errs.length ? errs[0] : 'clean');

  await browser.close();
  console.log(problems ? `\n${problems} PROBLEM(S)` : '\nHOSTED BUILD OK');
  process.exit(problems ? 1 : 0);
})();
