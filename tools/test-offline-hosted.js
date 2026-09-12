#!/usr/bin/env node
/**
 * test-offline-hosted.js — the question that matters: after visiting the hosted
 * app once with a connection, does it still work on a train?
 *
 * Loads the live site, waits for the service worker to store it, then cuts the
 * network entirely and drives the app.
 *
 *   node test-offline-hosted.js [https://…pages.dev]
 */
const { chromium } = require('playwright');

const ORIGIN = (process.argv[2] || 'https://quiet-harbour-k7m3q.pages.dev').replace(/\/+$/, '');
const APP = `${ORIGIN}/app`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext();
  let page = await ctx.newPage();
  let problems = 0;
  const check = (label, cond, detail = '') => {
    if (cond) console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
    else { problems++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  };

  console.log(`\nOFFLINE USE OF THE HOSTED APP — ${ORIGIN}\n`);

  // --- first visit, online ---
  await page.goto(APP + '#/home');
  await page.waitForSelector('.rowlink', { timeout: 30000 });
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready.catch(() => null);
    return !!r;
  });
  check('service worker installs on the first visit', reg);

  // give it a moment to finish precaching, and visit a module so it is stored
  await page.goto(APP + '#/physics/module/01-forces-and-motion');
  await page.waitForSelector('.rag-buttons', { timeout: 30000 });
  await page.waitForTimeout(4000);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find(k => k.startsWith('app-')));
    return (await c.keys()).length;
  });
  check('app and content stored in the browser', cached > 20, `${cached} files stored`);

  // --- now cut the network completely ---
  await ctx.setOffline(true);

  // The check that matters, and the one that is easy to fake: a BRAND NEW TAB.
  // Calling goto(APP + '#/home') on the tab that is already open is a
  // same-document hash change — no network request is made, so it passes even
  // when offline support is completely broken. Only a fresh tab, and a real
  // reload, actually exercise the service worker.
  await page.close();
  page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let fresh = false;
  try {
    await page.goto(APP + '#/home', { timeout: 30000 });
    await page.waitForSelector('.rowlink', { timeout: 20000 });
    fresh = true;
  } catch { /* reported below */ }
  check('a new tab opens the app with no connection', fresh);
  if (!fresh) {
    console.log('\n  Nothing else can be checked — the app did not load.');
    await browser.close();
    process.exit(1);
  }

  await page.evaluate(() => location.reload());
  await page.waitForSelector('.rowlink', { timeout: 20000 }).catch(() => {});
  check('a full reload with no connection still works',
    (await page.locator('.rowlink').count()) > 0);

  for (const [label, hash] of [
    ['the subject picker', '#/subjects'],
    ['physics home', '#/physics/home'], ['a physics module', '#/physics/module/02-solids-liquids-gases'],
    ['chemistry home', '#/chemistry/home'], ['a chemistry module', '#/chemistry/module/07-rates-of-reaction'],
    ['chemistry multiple choice', '#/chemistry/mcq/05-chemical-calculations'],
    ['a chemistry paper', '#/chemistry/mock/chem-2025'],
    ['physics multiple choice', '#/physics/mcq/all?n=10'], ['flashcards', '#/chemistry/cards'],
    ['coach view', '#/chemistry/coach'], ['priority module', '#/chemistry/priority'],
    ['exam reference', '#/chemistry/reference'], ['the last sheet', '#/physics/final'],
  ]) {
    await page.goto(APP + '#/subjects');
    await page.goto(APP + hash);
    await page.waitForTimeout(250);
    const len = await page.evaluate(() => document.getElementById('main').textContent.trim().length);
    check(`${label} works offline`, len > 50, `${len} chars`);
  }

  // tagging offline, and it must survive an offline reload
  await page.goto(APP + '#/physics/module/03-electrical-circuits');
  await page.waitForSelector('.rag-buttons', { timeout: 20000 });
  const rb = page.locator('.rag-buttons').first();
  await rb.scrollIntoViewIfNeeded();
  await rb.locator('.rb-red').click();
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(1200);
  const tags = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('physics-progress-v1') || '{}').confidence || {}).length);
  check('rating offline saves and survives a reload', tags > 0, `${tags} tag(s)`);

  // sync is the one thing that cannot work, and must say so clearly
  await page.goto(APP + '#/physics/sync');
  await page.waitForSelector('input.wide', { timeout: 20000 });
  await page.fill('input.wide', 'offline-check-code-1234');
  await page.click('button.act:has-text("Save")');
  await page.click('button.act:has-text("Check what is stored")');
  await page.waitForTimeout(2500);
  const msg = await page.textContent('.sync-status');
  check('sync explains itself when offline', /offline|connection/i.test(msg), `"${msg.trim().slice(0, 60)}…"`);

  check('no page errors while offline', errs.length === 0, errs[0] || 'clean');

  await browser.close();
  console.log(problems ? `\n${problems} PROBLEM(S)` : '\nWORKS OFFLINE');
  process.exit(problems ? 1 : 0);
})();
