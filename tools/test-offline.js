#!/usr/bin/env node
/**
 * test-offline.js — proves the single-file build works the way a phone opens
 * it: from file://, with no server, in the Safari engine, at iPhone size.
 */
const path = require('path');
const { webkit, chromium, devices } = require('playwright');

const FILE = path.resolve(__dirname, '..', 'John-Physics-Offline.html');
const url = 'file:///' + FILE.split(path.sep).join('/');

(async () => {
  let browser, engine;
  try { browser = await webkit.launch({ headless: true }); engine = 'WebKit (the Safari engine)'; }
  catch (e) {
    console.log('  note: WebKit not installed, using Chromium mobile emulation instead');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    engine = 'Chromium mobile emulation';
  }
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  let problems = 0;
  const check = (label, okCond, detail = '') => {
    if (okCond) console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
    else { problems++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  };

  console.log(`\nOFFLINE SINGLE FILE — ${engine}, iPhone 13 viewport, no server\n`);

  await page.goto(url);
  await page.waitForSelector('#main .rowlink', { timeout: 15000 });
  check('loads from file:// with content embedded', true);

  const routes = [
    ['home', '#/home'], ['module', '#/module/01-forces-and-motion'],
    ['priority', '#/priority'], ['multiple choice', '#/mcq/all?n=10'],
    ['flashcards', '#/cards'], ['coach view', '#/coach'],
    ['red list', '#/red'], ['last sheet', '#/final'],
    ['past paper', '#/mock/paper-2025'], ['reference', '#/reference'],
  ];
  for (const [label, hash] of routes) {
    await page.goto(url + '#/home');
    await page.goto(url + hash);
    await page.waitForTimeout(220);
    const info = await page.evaluate(() => ({
      len: document.getElementById('main').textContent.trim().length,
      over: document.body.scrollWidth > window.innerWidth + 2,
    }));
    check(`${label} renders on a phone`, info.len > 50 && !info.over,
      info.len <= 50 ? 'rendered nothing' : info.over ? 'overflows the screen' : `${info.len} chars, no overflow`);
  }

  // tagging by touch, and whether it survives a reload from file://
  await page.goto(url + '#/module/06-radioactivity');
  await page.waitForSelector('.rag-dot', { timeout: 10000 });
  const dot = page.locator('.rag-dot').first();
  await dot.scrollIntoViewIfNeeded();
  await dot.tap();
  await page.waitForSelector('.rag-pop', { timeout: 5000 });
  await page.locator('.rag-pop .sw-red').tap();
  const tagged = await page.evaluate(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem('physics-progress-v1') || '{}').confidence || {}).length; }
    catch { return -1; }
  });
  check('tagging works by touch', tagged > 0, `${tagged} tag(s) stored`);

  await page.reload();
  await page.waitForTimeout(500);
  const survived = await page.evaluate(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem('physics-progress-v1') || '{}').confidence || {}).length; }
    catch { return -1; }
  });
  check('progress survives a reload', survived > 0, `${survived} tag(s) after reload`);

  // answering an MCQ end to end
  await page.goto(url + '#/mcq/all?n=10&mode=even');
  await page.waitForSelector('.mcq-option', { timeout: 10000 });
  await page.locator('.mcq-option').first().tap();
  await page.waitForSelector('.mcq-explain', { timeout: 5000 });
  check('multiple choice marks and explains', true);

  check('no page or console errors', errs.length === 0, errs.length ? errs[0] : 'clean');

  await browser.close();
  console.log(problems ? `\n${problems} PROBLEM(S)` : '\nOFFLINE BUILD OK');
  process.exit(problems ? 1 : 0);
})();
