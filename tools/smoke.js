#!/usr/bin/env node
/**
 * smoke.js — visits every route in three states (empty, populated, hostile
 * parameters) and fails on any console error, page error, or empty render.
 *
 * The e2e suite proves the features work; this proves nothing crashes.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// override with BASE=… when the app is served on another port
const BASE = process.env.BASE || 'http://localhost:8123/app.html';
const MIRROR = path.join(__dirname, '..', 'site', 'progress', 'physics-progress-backup.json');
const stashed = fs.existsSync(MIRROR) ? fs.readFileSync(MIRROR, 'utf8') : null;
process.on('exit', () => {
  try {
    if (stashed !== null) fs.writeFileSync(MIRROR, stashed);
    else if (fs.existsSync(MIRROR)) fs.unlinkSync(MIRROR);
  } catch { /* best effort */ }
});

const MODULES = ['01-forces-and-motion', '02-solids-liquids-gases', '03-electrical-circuits',
  '04-waves-and-em-spectrum', '05-static-electricity', '06-radioactivity',
  '07-practical-and-data-skills', '08-energy'];
const PAPERS = ['mock-1', 'mock-2', 'paper-2023', 'paper-2024', 'paper-2025'];

const ROUTES = [
  '#/home', '#/priority', '#/red', '#/coach', '#/diagnostic', '#/practice',
  '#/cards', '#/cards?mode=module', '#/eq-drill', '#/eq-drill?only=memorise',
  '#/mix-drill', '#/mix-drill?mode=weak', '#/mix-drill?n=all',
  '#/mcq', '#/mcq/all', '#/mcq/all?mode=weak&n=10', '#/mcq/wrong',
  '#/review', '#/reference', '#/spec', '#/final', '#/search',
  ...MODULES.map(m => `#/module/${m}`),
  ...MODULES.map(m => `#/mcq/${m}`),
  ...PAPERS.map(p => `#/mock/${p}`),
  ...PAPERS.map(p => `#/mock/${p}?mode=revise`),
  ...PAPERS.map(p => `#/mock/${p}?mode=enter`),
];

const HOSTILE = [
  '#/module/does-not-exist', '#/mcq/does-not-exist', '#/mock/does-not-exist',
  '#/mcq/custom?mods=999', '#/mcq/all?n=abc', '#/mix-drill?n=-5',
  '#/mix-drill?mods=99', '#/cards?mods=', '#/mcq/all?n=99999',
  '#/module/01-forces-and-motion?item=nope', '#/nonsense', '#/',
];

const SEED = () => {
  const at = new Date().toISOString();
  const st = {
    version: 1, lastOpened: at, lastExported: null,
    confidence: {
      '04-waves-and-em-spectrum': { value: 'green', at, history: [{ value: 'green', at }] },
      '06-radioactivity': { value: 'red', at, history: [{ value: 'red', at }] },
      '01-forces-and-motion/def/hookes-law': { value: 'red', at, history: [{ value: 'red', at }] },
      '02-solids-liquids-gases/section/sheet': { value: 'amber', at, history: [{ value: 'amber', at }] },
      'technique/units-convert-before-substituting': { value: 'red', at, history: [{ value: 'red', at }] },
    },
    attempts: [
      { questionId: '01-forces-and-motion/drill/D1', at, selfRating: 'partly', attemptNumber: 1, markPointsHit: 2, markPointsTotal: 4 },
      { questionId: '01-forces-and-motion/understanding/U1', at, selfRating: 'no-idea', attemptNumber: 1 },
      { questionId: '04-waves-and-em-spectrum/mcq/M1', at, selfRating: 'no-idea', attemptNumber: 1 },
      { questionId: '04-waves-and-em-spectrum/mcq/M2', at, selfRating: 'no-idea', attemptNumber: 1 },
      { questionId: '03-electrical-circuits/mcq/M5', at, selfRating: 'got-it', attemptNumber: 1 },
      { questionId: 'mock-1/q/3', at, selfRating: 'no-idea', attemptNumber: 1 },
    ],
    mockAttempts: [{
      mockId: 'mock-1', at, totalScore: 61, totalMarks: 100, minutesTaken: 88,
      questionScores: [{ number: 1, score: 2, marks: 6 }, { number: 2, score: 7, marks: 9 },
        { number: 3, score: 4, marks: 8 }, { number: 4, score: 3, marks: 10 }],
      errorTags: [{ questionNumber: 1, marksLost: 3, code: 'knowledge' },
        { questionNumber: 4, marksLost: 2, code: 'unit-conversion' }],
    }],
    diagnosticAttempts: [{
      at, finishedInTime: true, blankQuestions: 'G3',
      sections: [{ letter: 'A', score: 5, marks: 8, codes: { K: 2, W: 1 } },
        { letter: 'B', score: 4, marks: 8, codes: { M: 2 } },
        { letter: 'C', score: 6, marks: 8, codes: {} },
        { letter: 'D', score: 3, marks: 7, codes: { K: 4 } }],
    }],
    flashcards: { '01-forces-and-motion/eq/moment': { due: '2026-08-20', history: [{ at, rating: 'got-it' }] } },
    writtenAnswers: { '01-forces-and-motion/drill/D1': 'moment = force x distance' },
    activeMock: null, checklist: { 'Sat 8 – Sun 9 Aug': true }, prefs: {},
  };
  localStorage.setItem('physics-progress-v1', JSON.stringify(st));
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let problems = 0;

  async function sweep(label, routes, seeder) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
    page.on('pageerror', e => errs.push(`pageerror: ${e.message}`));

    await page.goto(BASE + '#/home');
    await page.evaluate(seeder || (() => localStorage.removeItem('physics-progress-v1')));
    await page.reload();
    await page.waitForSelector('#main', { timeout: 10000 });

    let checked = 0;
    for (const route of routes) {
      errs.length = 0;
      await page.goto(BASE + '#/home');
      await page.goto(BASE + route);
      // give the view a beat to render and any timers to fire
      await page.waitForTimeout(120);
      const info = await page.evaluate(() => {
        const main = document.getElementById('main');
        return { children: main?.children.length || 0, text: (main?.textContent || '').trim().length };
      });
      if (errs.length) {
        problems++;
        console.log(`  FAIL [${label}] ${route}\n        ${errs.slice(0, 2).join('\n        ')}`);
      } else if (info.children === 0 || info.text < 20) {
        problems++;
        console.log(`  FAIL [${label}] ${route} — rendered nothing (${info.text} chars)`);
      }
      checked++;
    }
    console.log(`  ${checked} routes swept [${label}]`);
    await page.close();
  }

  console.log('\nEMPTY STATE — what a fresh install shows');
  await sweep('empty', ROUTES, null);

  console.log('\nPOPULATED STATE — tags, attempts, a marked mock and diagnostic');
  await sweep('populated', ROUTES, SEED);

  console.log('\nHOSTILE PARAMETERS — bad ids, junk numbers, missing values');
  await sweep('hostile', HOSTILE, SEED);

  // ---- narrow viewport: the coach view is read on a phone ----
  console.log('\nPHONE WIDTH — coach view and home must not overflow');
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '#/home');
    await page.evaluate(SEED);
    await page.reload();
    for (const route of ['#/home', '#/coach', '#/priority', '#/final', '#/mcq/all?n=10']) {
      await page.goto(BASE + '#/home');
      await page.goto(BASE + route);
      await page.waitForTimeout(120);
      const over = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
      if (over) { problems++; console.log(`  FAIL ${route} overflows at 375px`); }
    }
    if (errs.length) { problems++; console.log(`  FAIL phone errors: ${errs[0]}`); }
    console.log('  5 routes checked at 375px');
    await page.close();
  }

  await browser.close();
  console.log(problems ? `\n${problems} PROBLEM(S)` : '\nNO PROBLEMS FOUND');
  process.exit(problems ? 1 : 0);
})();
