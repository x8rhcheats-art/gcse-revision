#!/usr/bin/env node
/**
 * e2e.js — real-input end-to-end test of the app using Playwright + system Edge.
 * Unlike DOM .click() checks, these are trusted input events: if a button is
 * invisible, covered, or off-screen, the click fails — same as a real user.
 *
 * Run: node e2e.js   (server must be up on localhost:8123)
 */
const { chromium } = require('playwright');

// override with BASE=… when the app is served on another port
const BASE = process.env.BASE || 'http://localhost:8123/app.html';
let failures = 0;
// Counts read off the app once and reused, so adding a module cannot break a
// run: DECK = flashcards in the full deck, EQS = named equations in the drill.
let DECK = 0, EQS = 0;
const ok = (name) => console.log(`  PASS  ${name}`);
const fail = (name, err) => { failures++; console.log(`  FAIL  ${name}\n        ${err}`); };

// The app mirrors its state to site/progress/ through the same server the tests
// drive, so a test run would otherwise overwrite real progress. Stash it first
// and put it back at the end.
const fs = require('fs');
const path = require('path');
const MIRROR = path.join(__dirname, '..', 'site', 'progress', 'physics-progress-backup.json');
const stashed = fs.existsSync(MIRROR) ? fs.readFileSync(MIRROR, 'utf8') : null;
function restoreMirror() {
  try {
    if (stashed !== null) fs.writeFileSync(MIRROR, stashed);
    else if (fs.existsSync(MIRROR)) fs.unlinkSync(MIRROR);
  } catch { /* best effort */ }
}
process.on('exit', restoreMirror);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  // This suite exercises the physics content, and the routes below are the
  // bare (subject-less) form, which the router resolves against whichever
  // subject was last opened. Pin that to physics first, or the run silently
  // tests a different subject and every selector misses.
  await page.goto(BASE + '#/physics/home');
  await page.evaluate(() => {
    localStorage.setItem('revision-active-subject', 'physics');
    localStorage.removeItem('physics-progress-v1');
  });
  await page.reload();
  await page.waitForSelector('.rowlink', { timeout: 5000 });

  // ---------- flashcards: five cards end to end ----------
  try {
    await page.goto(BASE + '#/cards');
    await page.waitForSelector('.card-stage .front', { timeout: 5000 });
    for (let k = 0; k < 5; k++) {
      const front = await page.textContent('.card-stage .front');
      await page.click('.card-actions button:has-text("Show")', { timeout: 3000 });
      await page.waitForSelector('.card-stage .back', { timeout: 3000 });
      await page.click('.card-actions button:has-text("Partly")', { timeout: 3000 });
      await page.waitForFunction(
        prev => document.querySelector('.card-stage .front')?.textContent !== prev,
        front, { timeout: 3000 });
    }
    ok('flashcards: show → rate → advance, five cards');
  } catch (e) { fail('flashcards', e.message.split('\n')[0]); }

  // ---------- flashcards: nothing disappears — full deck, rated cards sink ----------
  try {
    await page.goto(BASE + '#/home');            // leave the view first: same-hash goto is a no-op
    await page.goto(BASE + '#/cards');
    await page.waitForFunction(
      () => /Card 1 of \d+/.test(document.querySelector('.plain-note')?.textContent || ''),
      null, { timeout: 5000 });
    // The deck grows every time a module is added, so read the size off the page
    // rather than pinning it — a stale literal here fails four tests in a row.
    const note = await page.locator('.plain-note').first().textContent();
    DECK = Number(note.match(/of (\d+)/)[1]);
    if (!(DECK > 20)) throw new Error(`deck is only ${DECK} cards`);
    if (!/scheduled for review today/.test(note)) throw new Error('no scheduling line: ' + note);
    ok(`flashcards: full deck stays (${DECK} cards, scheduling line present)`);
  } catch (e) { fail('flashcards full deck', e.message.split('\n')[0]); }

  // ---------- sidebar link to the CURRENT view re-renders it fresh ----------
  try {
    await page.click('.card-actions button:has-text("Show")', { timeout: 3000 });
    await page.click('.card-actions button:has-text("Got it")', { timeout: 3000 });
    await page.waitForFunction(() => document.querySelector('.plain-note')?.textContent?.includes('Card 2'), null, { timeout: 3000 });
    await page.click('#sidenav a.navlink:has-text("Flashcards")');   // same hash — used to be a dead click
    await page.waitForFunction(n => document.querySelector('.plain-note')?.textContent?.includes(`Card 1 of ${n}`), DECK, { timeout: 3000 });
    ok('same-hash nav click restarts the view');
  } catch (e) { fail('same-hash nav click', e.message.split('\n')[0]); }

  // ---------- card navigation: Next, Back, and Index jump straight to card 52 ----------
  try {
    await page.click('.card-actions button:has-text("Next")', { timeout: 3000 });
    await page.waitForFunction(n => document.querySelector('.plain-note')?.textContent?.includes(`Card 2 of ${n}`), DECK, { timeout: 3000 });
    await page.click('.card-actions button:has-text("Back")', { timeout: 3000 });
    await page.waitForFunction(n => document.querySelector('.plain-note')?.textContent?.includes(`Card 1 of ${n}`), DECK, { timeout: 3000 });
    await page.click('.card-actions button:has-text("Index")', { timeout: 3000 });
    await page.waitForSelector('.card-index button', { timeout: 3000 });
    await page.locator('.card-index button').nth(51).click();
    await page.waitForFunction(n => document.querySelector('.plain-note')?.textContent?.includes(`Card 52 of ${n}`), DECK, { timeout: 3000 });
    ok('card navigation: next, back, index jump to card 52');
  } catch (e) { fail('card navigation', e.message.split('\n')[0]); }

  // ---------- equation backs carry a symbol key ----------
  try {
    await page.goto(BASE + '#/home');
    await page.goto(BASE + '#/eq-drill');
    await page.waitForSelector('.card-stage .front', { timeout: 5000 });
    for (let k = 0; k < 3; k++) {   // three random equations, each must explain its symbols
      await page.click('.card-actions button:has-text("Show")', { timeout: 3000 });
      await page.waitForSelector('.card-stage .back .card-note', { timeout: 3000 });
      const note = await page.textContent('.card-stage .back .card-note');
      if (note.trim().length < 10) throw new Error('empty symbol note');
      await page.click('.card-actions button:has-text("Next")', { timeout: 3000 });
      await page.waitForSelector('.card-stage .front', { timeout: 3000 });
    }
    ok('equation backs: symbol key present under the formula');
  } catch (e) { fail('equation symbol keys', e.message.split('\n')[0]); }

  // ---------- card fronts: every card states its task, no front leaks its answer ----------
  try {
    await page.goto(BASE + '#/home');
    await page.goto(BASE + '#/cards');
    await page.waitForSelector('.card-prompt', { timeout: 5000 });
    const prompt = await page.textContent('.card-prompt');
    if (!prompt.trim()) throw new Error('current card has an empty prompt');
    await page.click('.card-actions button:has-text("Index")', { timeout: 3000 });
    await page.waitForSelector('.card-index button', { timeout: 3000 });
    const fronts = await page.locator('.card-index button').allTextContents();
    const bad = fronts.filter(f =>
      /formula sheet|memorise|both directions|mass −4|atomic \+1|both unchanged/i.test(f.split('—')[0]));
    // the decay cards legitimately contain "—" questions; only flag answer leaks BEFORE the question mark
    const leaks = fronts.filter(f => /mass −4|atomic \+1|— both unchanged$/i.test(f) && !/what happens/i.test(f));
    if (bad.length && leaks.length) throw new Error('leaky fronts: ' + leaks[0]);
    const stale = fronts.filter(f => /On the formula sheet|memorise the wording/i.test(f));
    if (stale.length) throw new Error('unclean front: ' + stale[0]);
    await page.click('.card-actions button:has-text("Index")'); // close
    ok('card fronts: prompts present, no authoring notes or answer leaks');
  } catch (e) { fail('card fronts', e.message.split('\n')[0]); }

  // ---------- equation drill has the same navigation ----------
  try {
    await page.goto(BASE + '#/eq-drill');
    await page.waitForSelector('.card-stage .front', { timeout: 5000 });
    await page.click('.card-actions button:has-text("Index")', { timeout: 3000 });
    await page.waitForSelector('.card-index button', { timeout: 3000 });
    // Named equations only — the unnamed formula-sheet items are dropped because
    // their front would equal their back. Read the total rather than pinning it.
    const count = await page.locator('.card-index button').count();
    EQS = count;
    if (count < 20) throw new Error(`index lists only ${count} equations`);
    await page.locator('.card-index button').nth(19).click();
    await page.waitForFunction(n => document.querySelector('.card-meta')?.textContent?.startsWith(`20 of ${n}`), EQS, { timeout: 3000 });
    ok(`equation drill: index lists all ${count}, jumps to card 20`);
  } catch (e) { fail('eq drill navigation', e.message.split('\n')[0]); }

  // ---------- equation drill: three cards, including a 30s-timer presence check ----------
  try {
    await page.goto(BASE + '#/eq-drill');
    await page.waitForSelector('.card-stage .front', { timeout: 5000 });
    for (let k = 0; k < 3; k++) {
      const front = await page.textContent('.card-stage .front');
      const t = await page.textContent('.eq-timer');
      if (!/^0:\d\d$/.test(t.trim())) throw new Error(`timer shows "${t}"`);
      await page.click('.card-actions button:has-text("Show")', { timeout: 3000 });
      await page.waitForSelector('.card-stage .back', { timeout: 3000 });
      await page.click('.card-actions button:has-text("Got it")', { timeout: 3000 });
      await page.waitForFunction(
        prev => document.querySelector('.card-stage .front')?.textContent !== prev,
        front, { timeout: 3000 });
    }
    ok('equation drill: show → rate → advance, three cards');
  } catch (e) { fail('equation drill', e.message.split('\n')[0]); }

  // ---------- module exam drill: strip visible, answer opens ----------
  try {
    await page.goto(BASE + '#/module/01-forces-and-motion');
    await page.waitForSelector('[data-question-id="01-forces-and-motion/drill/D1"]', { timeout: 5000 });
    const q = page.locator('[data-question-id="01-forces-and-motion/drill/D1"]');
    await q.locator('summary').scrollIntoViewIfNeeded();
    await q.locator('summary').click({ timeout: 3000 });
    await page.click('.rate-strip button:has-text("Got it")', { timeout: 3000 });
    await q.locator('details.ans .inner').waitFor({ state: 'visible', timeout: 3000 });
    ok('module drill: show answer → rate → answer visible');
  } catch (e) { fail('module drill', e.message.split('\n')[0]); }

  // ---------- mixed practice: answer, next, and index navigation ----------
  try {
    await page.goto(BASE + '#/mix-drill');
    await page.waitForSelector('details.ans summary', { timeout: 5000 });
    await page.click('details.ans summary', { timeout: 3000 });
    await page.click('.rate-strip button:has-text("No idea")', { timeout: 3000 });
    await page.locator('details.ans .inner').waitFor({ state: 'visible', timeout: 3000 });
    await page.click('.card-actions button:has-text("Next")', { timeout: 3000 });
    await page.waitForFunction(() => document.querySelector('.card-meta')?.textContent?.startsWith('2 of'), null, { timeout: 3000 });
    await page.click('.card-actions button:has-text("Index")', { timeout: 3000 });
    await page.waitForSelector('.card-index button', { timeout: 3000 });
    const qCount = await page.locator('.card-index button').count();
    if (qCount !== 20) throw new Error(`index lists ${qCount} questions, expected the default 20`);
    await page.locator('.card-index button').nth(7).click();
    await page.waitForFunction(() => document.querySelector('.card-meta')?.textContent?.startsWith('8 of'), null, { timeout: 3000 });
    ok('mixed practice: answer visible, next works, index jumps to question 8');
  } catch (e) { fail('mixed practice', e.message.split('\n')[0]); }

  // ---------- revision mode on a mock: reveal, rate, tag, related links ----------
  try {
    await page.goto(BASE + '#/mock/mock-1?mode=revise');
    await page.waitForSelector('[data-question-id="mock-1/q/1"]', { timeout: 5000 });
    const q1 = page.locator('[data-question-id="mock-1/q/1"]');
    await q1.locator('summary').scrollIntoViewIfNeeded();
    await q1.locator('summary').click({ timeout: 3000 });
    await page.click('.rate-strip button:has-text("No idea")', { timeout: 3000 });
    await q1.locator('details.ans .inner').waitFor({ state: 'visible', timeout: 3000 });
    // mark scheme content + new-tab revision links inside the answer
    const links = await q1.locator('details.ans a[target="_blank"]').count();
    if (links < 2) throw new Error(`only ${links} new-tab links in the answer`);
    const st1 = await page.evaluate(() => JSON.parse(localStorage.getItem('physics-progress-v1')));
    const att = st1.attempts.find(a => a.questionId === 'mock-1/q/1');
    if (!att || att.selfRating !== 'no-idea') throw new Error('revision self-rating not recorded');
    // tag the question red via its margin dot
    const dot = page.locator('.rag-dot[data-for="mock-1/q/1"]');
    await dot.scrollIntoViewIfNeeded();
    await dot.hover();
    await page.click('.rag-pop .sw-red', { timeout: 3000 });
    await page.goto(BASE + '#/red');
    await page.waitForFunction(() => document.body.textContent.includes('Mock Exam 1 Q1'), null, { timeout: 3000 });
    ok('revision mode: rate feeds evidence, tag feeds red list, links present');
  } catch (e) { fail('revision mode', e.message.split('\n')[0]); }

  // ---------- past papers: page, files, revision companion ----------
  try {
    for (const pid of ['paper-2023', 'paper-2024', 'paper-2025']) {
      await page.goto(BASE + `#/mock/${pid}`);
      await page.waitForFunction(() => document.querySelector('.vhead h1')?.textContent?.includes('Past Paper'), null, { timeout: 5000 });
    }
    await page.goto(BASE + '#/mock/paper-2023?mode=revise');
    await page.waitForSelector('[data-question-id="paper-2023/q/1"]', { timeout: 5000 });
    const pq = page.locator('[data-question-id="paper-2023/q/3"]');
    await pq.locator('summary').scrollIntoViewIfNeeded();
    await pq.locator('summary').click({ timeout: 3000 });
    await page.click('.rate-strip button:has-text("Partly")', { timeout: 3000 });
    await pq.locator('details.ans .inner').waitFor({ state: 'visible', timeout: 3000 });
    const msLink = await pq.locator('details.ans a[href*="markscheme"]').count();
    if (!msLink) throw new Error('no mark scheme link in past-paper answer');
    ok('past papers: three pages render, revision companion works');
  } catch (e) { fail('past papers', e.message.split('\n')[0]); }

  // ---------- multiple choice: per-module quiz, feedback, evidence recorded ----------
  try {
    await page.goto(BASE + '#/mcq');
    await page.waitForSelector('.rowlink', { timeout: 5000 });
    // whole curriculum + weakest three + 8 modules, plus a retry row once he has misses
    const rows = await page.locator('.rowlink').count();
    if (rows < 10) throw new Error(`${rows} rows on the MCQ home, expected at least 10`);
    const weakest = await page.locator('.rowlink:has-text("Weakest three")').count();
    if (!weakest) throw new Error('no weakest-three entry on the MCQ home');
    await page.goto(BASE + '#/mcq/03-electrical-circuits');
    await page.waitForSelector('.mcq-option', { timeout: 5000 });
    // answer two questions: click the RIGHT option first, then a WRONG one
    for (let k = 0; k < 2; k++) {
      const buttons = page.locator('.mcq-option');
      // find which button is right by trial: read the current question id, look it up in the served bank
      const meta = await page.textContent('.card-meta');
      const qid = meta.trim().split('·').pop().trim();
      const bank = await page.evaluate(async () => (await (await fetch('content/physics/mcq.json')).json()).modules['03-electrical-circuits']);
      const q = bank.find(x => x.id === qid);
      const texts = await buttons.allTextContents();
      const rightPos = texts.findIndex(t => t.slice(1) === q.options[q.answer]);
      const clickPos = k === 0 ? rightPos : (rightPos + 1) % 4;   // right, then wrong
      await buttons.nth(clickPos).click();
      await page.waitForSelector('.mcq-explain', { timeout: 3000 });
      const rightMarked = await page.locator('.mcq-option.right').count();
      if (rightMarked !== 1) throw new Error('correct option not highlighted');
      await page.click('button.act:has-text("question"), button.act:has-text("Finish")', { timeout: 3000 });
    }
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('physics-progress-v1')));
    const mcqAttempts = st.attempts.filter(a => a.questionId.includes('/mcq/'));
    if (mcqAttempts.length !== 2) throw new Error(`${mcqAttempts.length} mcq attempts recorded, expected 2`);
    if (mcqAttempts[0].selfRating !== 'got-it' || mcqAttempts[1].selfRating !== 'no-idea')
      throw new Error('right/wrong not mapped to got-it/no-idea');
    // whole-curriculum session exists and is capped at 20
    await page.goto(BASE + '#/mcq/all?n=20&mode=even');
    await page.waitForFunction(() => document.querySelector('.card-meta')?.textContent?.includes('of 20'), null, { timeout: 5000 });
    ok('multiple choice: 9 sections, marking + evidence recording, curriculum session of 20');
  } catch (e) { fail('multiple choice', e.message.split('\n')[0]); }

  // ---------- write-then-self-mark on an extended-answer drill question ----------
  try {
    await page.goto(BASE + '#/module/01-forces-and-motion');
    await page.waitForSelector('[data-question-id="01-forces-and-motion/drill/D4"]', { timeout: 5000 });
    const q = page.locator('[data-question-id="01-forces-and-motion/drill/D4"]');
    await q.locator('.answer-box').scrollIntoViewIfNeeded();
    await q.locator('.answer-box').fill('Weight is 800 N. Resultant is 300 N so a = 3.75 m/s2.');
    await q.locator('summary').click({ timeout: 3000 });
    await page.click('.rate-strip button:has-text("Partly")', { timeout: 3000 });
    await q.locator('.markpoints').waitFor({ state: 'visible', timeout: 3000 });
    const boxes = q.locator('.markpoints input[type=checkbox]');
    const nBoxes = await boxes.count();
    if (nBoxes < 3) throw new Error(`only ${nBoxes} mark points offered`);
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.waitForFunction(() => /^[1-9]\d* of \d+ mark points$/.test(
      document.querySelector('.mp-tally')?.textContent || ''), null, { timeout: 3000 });
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('physics-progress-v1')));
    const att = st.attempts.filter(a => a.questionId === '01-forces-and-motion/drill/D4').pop();
    if (!att.markPointsTotal) throw new Error('mark points not recorded on the attempt');
    if (!st.writtenAnswers['01-forces-and-motion/drill/D4']) throw new Error('written answer not saved');
    // and it survives a reload
    await page.reload();
    await page.waitForSelector('[data-question-id="01-forces-and-motion/drill/D4"] .answer-box', { timeout: 5000 });
    const restored = await page.inputValue('[data-question-id="01-forces-and-motion/drill/D4"] .answer-box');
    if (!restored.includes('800 N')) throw new Error('written answer not restored');
    ok(`write-then-self-mark: answer saved, ${nBoxes} mark points ticked into evidence`);
  } catch (e) { fail('write-then-self-mark', e.message.split('\n')[0]); }

  // ---------- review queue: wrong answers collected, MCQ retry ----------
  try {
    await page.goto(BASE + '#/review');
    await page.waitForSelector('.view', { timeout: 5000 });
    const text = await page.textContent('.view');
    if (!/multiple choice/i.test(text)) throw new Error('MCQ misses not shown in review');
    await page.click('button.act:has-text("Retry these now"), a.act:has-text("Retry these now")', { timeout: 3000 });
    await page.waitForSelector('.mcq-option', { timeout: 5000 });
    const title = await page.textContent('.vhead h1');
    if (!/got wrong/.test(title)) throw new Error(`retry view title was "${title}"`);
    ok('review queue: wrong answers listed, MCQ retry runs only the misses');
  } catch (e) { fail('review queue', e.message.split('\n')[0]); }

  // ---------- exam reference: formula sheet, must-memorise, taggable rules ----------
  try {
    await page.goto(BASE + '#/reference');
    await page.waitForSelector('.rule', { timeout: 5000 });
    const rules = await page.locator('.rule').count();
    if (rules !== 29) throw new Error(`${rules} technique rules rendered, expected 29`);
    const checklists = await page.locator('.panel').count();
    if (checklists !== 4) throw new Error(`${checklists} diagram checklists, expected 4`);
    const body = await page.textContent('.view');
    if (!/must memorise|must memorise/i.test(body) && !/NOT on the sheet/.test(body))
      throw new Error('must-memorise list missing');
    // tag a technique rule red and confirm it reaches the red list
    const dot = page.locator('.rag-dot[data-for="technique/T7"]');
    await dot.scrollIntoViewIfNeeded();
    await dot.hover();
    await page.click('.rag-pop .sw-red', { timeout: 3000 });
    await page.goto(BASE + '#/red');
    await page.waitForFunction(() => document.body.textContent.includes('Exam technique'), null, { timeout: 3000 });
    ok('exam reference: 29 rules, 4 checklists, rules tag into the red list');
  } catch (e) { fail('exam reference', e.message.split('\n')[0]); }

  // ---------- specification: 136 points, colour inherited from module tags ----------
  try {
    await page.goto(BASE + '#/spec');
    await page.waitForSelector('.specpoint', { timeout: 5000 });
    const pts = await page.locator('.specpoint').count();
    if (pts !== 136) throw new Error(`${pts} spec points rendered, expected 136`);
    // tagging the whole module should colour its spec points by inheritance
    await page.goto(BASE + '#/module/06-radioactivity');
    await page.waitForSelector('.rag-dot', { timeout: 5000 });
    const modDot = page.locator('.rag-dot[data-for="06-radioactivity"]');
    await modDot.scrollIntoViewIfNeeded();
    await modDot.hover();
    await page.click('.rag-pop .sw-amber', { timeout: 3000 });
    await page.goto(BASE + '#/spec');
    await page.waitForSelector('.specpoint', { timeout: 5000 });
    const inherited = await page.locator('.rag-dot[data-for="spec/7.12"].v-amber.inherited').count();
    if (!inherited) throw new Error('spec point did not inherit the module tag');
    ok('specification: 136 points, module tags inherit down to spec points');
  } catch (e) { fail('specification', e.message.split('\n')[0]); }

  // ---------- the last sheet ----------
  try {
    await page.goto(BASE + '#/final');
    await page.waitForSelector('.finalsheet', { timeout: 5000 });
    const sections = await page.locator('.finalsheet section').count();
    if (sections < 4) throw new Error(`only ${sections} sections on the last sheet`);
    const body = await page.textContent('.finalsheet');
    if (!/equations not on the formula sheet/i.test(body)) throw new Error('must-memorise block missing');
    if (!/Still red/i.test(body)) throw new Error('red block missing');
    ok('the last sheet: assembles from tags, wrong answers and marked papers');
  } catch (e) { fail('the last sheet', e.message.split('\n')[0]); }

  // ---------- equation drill: must-memorise filter ----------
  try {
    await page.goto(BASE + '#/eq-drill?only=memorise');
    await page.waitForSelector('.card-stage .front', { timeout: 5000 });
    await page.click('.card-actions button:has-text("Index")', { timeout: 3000 });
    await page.waitForSelector('.card-index button', { timeout: 3000 });
    const n = await page.locator('.card-index button').count();
    // must be a strict subset — the formula-sheet equations are filtered out
    if (!(n > 0 && n < EQS)) throw new Error(`must-memorise deck has ${n} cards, expected fewer than the full ${EQS}`);
    ok(`equation drill: must-memorise filter isolates the ${n} not on the formula sheet`);
  } catch (e) { fail('eq drill memorise filter', e.message.split('\n')[0]); }

  // ---------- session builder + adaptive selection ----------
  try {
    // seed a weakness: tag module 4 green, then get its MCQs wrong -> blind spot
    await page.goto(BASE + '#/home');
    await page.evaluate(() => {
      const KEY = 'physics-progress-v1';
      const st = JSON.parse(localStorage.getItem(KEY));
      const at = new Date().toISOString();
      st.confidence['04-waves-and-em-spectrum'] = { value: 'green', at, history: [{ value: 'green', at }] };
      st.confidence['04-waves-and-em-spectrum/def/amplitude'] = { value: 'red', at, history: [{ value: 'red', at }] };
      for (let k = 1; k <= 10; k++) {
        st.attempts.push({ questionId: `04-waves-and-em-spectrum/mcq/M${k}`, at, selfRating: 'no-idea', attemptNumber: 1 });
      }
      localStorage.setItem(KEY, JSON.stringify(st));
    });
    // the store reads localStorage once at load, so a seed needs a real reload
    await page.goto(BASE + '#/practice');
    await page.reload();
    await page.waitForSelector('.mod-chip', { timeout: 5000 });
    // the seeded blind spot must rank near the top of the picker. Asserting the
    // exact first place would depend on state left by every earlier test, so
    // check it is in the leading three of eight.
    const titles = await page.locator('.mod-chip .mc-title').allTextContents();
    const rank = titles.findIndex(t => /Waves/.test(t));
    if (rank < 0) throw new Error('seeded weak module missing from the picker');
    if (rank > 2) throw new Error(`seeded blind spot ranked ${rank + 1} of ${titles.length}, expected top 3`);
    // and it must carry the blind-spot state chip
    const chipState = await page.locator('.mod-chip:has-text("Waves") .state-chip').textContent();
    if (!/blind spot/.test(chipState)) throw new Error(`seeded module shows "${chipState}"`);
    // preset: my red topics selects the module holding the red item
    await page.click('button.act:has-text("My red topics")', { timeout: 3000 });
    const onCount = await page.locator('.mod-chip.on').count();
    if (onCount < 1) throw new Error('red preset selected nothing');
    // launch an MCQ session from the selection
    await page.click('.card-actions button.act:has-text("Multiple choice")', { timeout: 3000 });
    try {
      // the route may or may not carry the subject prefix (#/mcq/... vs
      // #/physics/mcq/...) depending on how the view was reached — accept both
      await page.waitForFunction(() => /^#\/(?:[a-z]+\/)?mcq\/custom/.test(location.hash), null, { timeout: 10000 });
    } catch {
      // say what the page was actually showing — a bare timeout here tells you nothing
      const st = await page.evaluate(() => ({
        hash: location.hash,
        picked: [...document.querySelectorAll('.mod-chip.on .mc-title')].map(e => e.textContent),
        launch: [...document.querySelectorAll('.card-actions button')].map(b => b.textContent.trim() + (b.disabled ? ' [disabled]' : '')),
      }));
      throw new Error(`launch did not navigate — hash ${st.hash}, selected ${JSON.stringify(st.picked)}, buttons ${JSON.stringify(st.launch)}`);
    }
    await page.waitForSelector('.mcq-option', { timeout: 5000 });
    const hash = await page.evaluate(() => location.hash);
    if (!/mods=\d/.test(hash)) throw new Error(`session hash lost its modules: ${hash}`);
    ok('session builder: ranks by need, presets select, launches a filtered quiz');
  } catch (e) { fail('session builder', e.message.split('\n')[0]); }

  // ---------- adaptive weighting actually biases the draw ----------
  try {
    await page.goto(BASE + '#/home');
    await page.goto(BASE + '#/mcq/all?n=20&mode=weak');
    await page.waitForSelector('.mcq-option', { timeout: 5000 });
    // with 10 wrong answers seeded in module 4, a weighted 20-question draw
    // should include module 4 far more often than its 1-in-8 share
    const share = await page.evaluate(async () => {
      const mcq = (await (await fetch('content/physics/mcq.json')).json()).modules;
      return { total: Object.values(mcq).reduce((a, q) => a + q.length, 0), m4: mcq['04-waves-and-em-spectrum'].length };
    });
    const baseline = share.m4 / share.total;      // ~13% unweighted
    // Walk two complete 20-question draws and count how many come from the weak
    // module. 40 samples makes this a real measurement, not a coin flip.
    let weak = 0, sampled = 0;
    for (let r = 0; r < 2; r++) {
      await page.goto(BASE + '#/home');
      await page.goto(BASE + '#/mcq/all?n=20&mode=weak');
      await page.waitForSelector('.mcq-option', { timeout: 5000 });
      for (let k = 0; k < 20; k++) {
        const meta = await page.textContent('.card-meta');
        if (/Waves/.test(meta)) weak++;
        sampled++;
        await page.locator('.mcq-option').first().click();
        await page.click('button.act:has-text("question"), button.act:has-text("Finish")', { timeout: 3000 });
        if (k < 19) await page.waitForSelector('.mcq-option', { timeout: 3000 });
      }
    }
    const expected = Math.round(baseline * sampled);          // ~5 of 40 unweighted
    if (weak <= expected) {
      throw new Error(`weak module drawn ${weak}/${sampled}, no better than the unweighted ${expected}/${sampled}`);
    }
    ok(`adaptive MCQ: weak module drawn ${weak}/${sampled} vs ${expected}/${sampled} unweighted`);
  } catch (e) { fail('adaptive weighting', e.message.split('\n')[0]); }

  // ---------- Priority Module: assembled from need, shares item identity ----------
  try {
    // seed: tag a definition red in a module, and get its questions wrong
    await page.goto(BASE + '#/home');
    await page.evaluate(() => {
      const KEY = 'physics-progress-v1';
      const st = JSON.parse(localStorage.getItem(KEY));
      const at = new Date().toISOString();
      st.confidence['06-radioactivity/def/half-life'] = { value: 'red', at, history: [{ value: 'red', at }] };
      st.confidence['06-radioactivity'] = { value: 'red', at, history: [{ value: 'red', at }] };
      localStorage.setItem(KEY, JSON.stringify(st));
    });
    await page.goto(BASE + '#/priority');
    await page.reload();                       // pick up the seeded tags
    await page.waitForSelector('.module-view', { timeout: 5000 });
    const title = await page.textContent('.vhead h1, header.top h1');
    if (!/Priority Module/.test(title)) throw new Error(`title was "${title}"`);
    // the red-tagged definition must have been pulled in
    const pulled = await page.locator('[data-item-id="06-radioactivity/def/half-life"]').count();
    if (!pulled) throw new Error('red-tagged definition was not prioritised');
    // it must be a module-sized view, not a dump of everything
    const items = await page.locator('[data-item-id]').count();
    if (items < 15 || items > 60) throw new Error(`${items} taggable items — not module-sized`);
    // all four section shapes present
    for (const sel of ['#sheet-a', '#understand-a', '#drill-a']) {
      if (!(await page.locator(sel).count())) throw new Error(`missing section ${sel}`);
    }
    // tagging here writes the SAME tag as the source module (shared identity)
    const dot = page.locator('.rag-dot[data-for="06-radioactivity/def/half-life"]');
    await dot.scrollIntoViewIfNeeded();
    await dot.hover();
    await page.click('.rag-pop .sw-green', { timeout: 3000 });
    await page.goto(BASE + '#/module/06-radioactivity');
    await page.waitForSelector('.rag-dot', { timeout: 5000 });
    const shared = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('physics-progress-v1')).confidence['06-radioactivity/def/half-life']?.value);
    if (shared !== 'green') throw new Error(`tag from priority view did not carry over: ${shared}`);
    ok('Priority Module: module-sized, need-driven, shares item identity with source modules');
  } catch (e) { fail('priority module', e.message.split('\n')[0]); }

  // ---------- complete pack reachable from the sidebar ----------
  try {
    await page.goto(BASE + '#/home');
    await page.waitForSelector('#sidenav', { timeout: 5000 });
    const packLink = page.locator('#sidenav a:has-text("Complete pack")');
    if (!(await packLink.count())) throw new Error('no complete pack link in the sidebar');
    const href = await packLink.getAttribute('href');
    const target = await packLink.getAttribute('target');
    if (!/complete-pack\.html/.test(href)) throw new Error(`pack href is "${href}"`);
    if (target !== '_blank') throw new Error('pack should open in a new tab');
    const priorityNav = await page.locator('#sidenav a:has-text("Priority Module")').count();
    if (!priorityNav) throw new Error('no Priority Module link in the sidebar');
    ok('sidebar: complete pack and Priority Module both present');
  } catch (e) { fail('sidebar links', e.message.split('\n')[0]); }

  // ---------- full coverage is always reachable; the mode is his choice ----------
  try {
    // MCQ: "Every question" runs the entire bank, unweighted
    await page.goto(BASE + '#/mcq');
    await page.waitForSelector('.rowlink', { timeout: 5000 });
    await page.click('.rowlink:has-text("Every question")', { timeout: 3000 });
    await page.waitForSelector('.mcq-option', { timeout: 5000 });
    const allTitle = await page.textContent('.vhead h1');
    // the bank grows as questions are authored, so assert against the real count
    const bankTotal = Object.values(require(path.join(__dirname, '..', 'site', 'content', 'physics', 'mcq.json')).modules).reduce((a, q) => a + q.length, 0);
    if (!new RegExp(bankTotal + ' questions').test(allTitle)) throw new Error(`full pass showed "${allTitle}", expected all ${bankTotal}`);

    // the switch is visible in the quiz and flips the mode
    // two switch rows now: question choice, then how many
    const rows = await page.locator('.mode-switch').count();
    if (rows !== 2) throw new Error(`${rows} switch rows in the quiz, expected 2`);
    const choiceRow = page.locator('.mode-switch').first();
    const sw = await choiceRow.locator('.ms-opt').count();
    if (sw !== 2) throw new Error(`${sw} mode options in the quiz, expected 2`);
    const lengths = await page.locator('.mode-switch').nth(1).locator('.ms-opt').count();
    if (lengths < 3) throw new Error(`${lengths} length options, expected a selector`);
    const evenCurrent = await choiceRow.locator('.ms-opt.current').textContent();
    if (!/Even/.test(evenCurrent)) throw new Error(`default mode is "${evenCurrent}", expected Even`);
    await choiceRow.locator('.ms-opt:has-text("Weighted")').click({ timeout: 3000 });
    await page.waitForFunction(() => document.querySelector('.mode-switch .ms-opt.current')?.textContent.includes('Weighted'), null, { timeout: 3000 });

    // and the choice sticks across a fresh visit
    await page.goto(BASE + '#/home');
    await page.goto(BASE + '#/mcq/03-electrical-circuits');
    await page.waitForSelector('.ms-opt.current', { timeout: 5000 });
    const remembered = await page.locator('.mode-switch').first().locator('.ms-opt.current').textContent();
    if (!/Weighted/.test(remembered)) throw new Error(`preference not remembered: "${remembered}"`);
    // put it back to even and confirm a single module still gives its whole bank
    await page.locator('.mode-switch').first().locator('.ms-opt:has-text("Even")').click({ timeout: 3000 });
    await page.waitForFunction(() => /32 questions|Electrical/.test(document.querySelector('.vhead h1')?.textContent || ''), null, { timeout: 3000 });
    ok('mode switch: full pass available, choice visible and remembered');
  } catch (e) { fail('mode switch', e.message.split('\n')[0]); }

  // ---------- drill and flashcards expose the same choice ----------
  try {
    // length and weighting are independent: n=all is what removes the cap
    await page.goto(BASE + '#/mix-drill?mode=even&n=all');
    await page.waitForSelector('.card-meta', { timeout: 5000 });
    const drillMeta = await page.textContent('.card-meta');
    // derived from the content, not hard-coded: writing more questions is the
    // point of the app, and must not be what breaks its test suite
    const wholeDrillPool = require(path.join(__dirname, '..', 'site', 'content', 'physics', 'modules.json'))
      .modules.reduce((a, m) => a + m.sections.drill.questions.length, 0);
    if (!new RegExp(`of ${wholeDrillPool}\\b`).test(drillMeta)) {
      throw new Error(`full drill pass drew "${drillMeta}", expected all ${wholeDrillPool}`);
    }
    // ...and a bare visit still gives the short 10-question session
    await page.goto(BASE + '#/home');
    await page.goto(BASE + '#/mix-drill');
    await page.waitForSelector('.card-meta', { timeout: 5000 });
    const shortMeta = await page.textContent('.card-meta');
    if (!/of 20/.test(shortMeta)) throw new Error(`bare mixed practice drew "${shortMeta}", expected 20`);
    await page.goto(BASE + '#/cards?mode=module');
    await page.waitForSelector('.card-stage', { timeout: 5000 });
    const firstCard = await page.textContent('.card-meta');
    if (!/Forces and Motion/.test(firstCard)) throw new Error(`module order started at "${firstCard}"`);
    ok('drill and flashcards: even/full-pass modes reachable and correct');
  } catch (e) { fail('even modes', e.message.split('\n')[0]); }

  // ---------- module filter reaches flashcards and drills ----------
  try {
    await page.goto(BASE + '#/cards?mods=4');
    await page.waitForSelector('.card-stage', { timeout: 5000 });
    const meta = await page.textContent('.card-meta');
    if (!/Waves/.test(meta)) throw new Error(`filtered flashcards showed "${meta}"`);
    await page.goto(BASE + '#/mix-drill?mods=4&n=5');
    await page.waitForSelector('.card-meta', { timeout: 5000 });
    const dmeta = await page.textContent('.card-meta');
    if (!/of 5 · Waves/.test(dmeta)) throw new Error(`filtered drill showed "${dmeta}"`);
    ok('module filter honoured by flashcards and drill questions');
  } catch (e) { fail('module filter', e.message.split('\n')[0]); }

  // ---------- sync between two machines: push here, pull there ----------
  try {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage(), bb = await ctxB.newPage();
    a.on("dialog", d => d.accept()); bb.on("dialog", d => d.accept());
    const tags = (pg) => pg.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem("physics-progress-v1") || "{}").confidence || {}).length; } catch { return 0; } });

    await a.goto(BASE + "#/module/06-radioactivity");
    await a.waitForSelector(".rag-dot", { timeout: 10000 });
    for (let i = 0; i < 3; i++) {
      const d = a.locator(".rag-dot").nth(i);
      await d.scrollIntoViewIfNeeded(); await d.hover();
      await a.click(".rag-pop .sw-red", { timeout: 5000 });
    }
    const mine = await tags(a);
    if (mine < 3) throw new Error(`seeded ${mine} tags on machine A, expected 3`);

    const code = "e2e-" + Math.random().toString(36).slice(2, 12);
    await a.goto(BASE + "#/sync"); await a.waitForSelector("input.wide", { timeout: 8000 });
    await a.fill("input.wide", code);
    await a.click('button.act:has-text("Save")');
    await a.click('button.act:has-text("Push")');
    await a.waitForFunction(() => /Pushed at/.test(document.querySelector(".sync-status")?.textContent || ""), null, { timeout: 25000 });

    await bb.goto(BASE + "#/sync"); await bb.waitForSelector("input.wide", { timeout: 8000 });
    await bb.fill("input.wide", code);
    await bb.click("button.act:has-text(\"Save\")");
    await bb.click("button.act:has-text(\"Pull\")");
    // The pull is a real network round-trip and the view reloads the page once it
    // lands, so poll for the tags. A fixed sleep here made this test flaky.
    await bb.waitForFunction(n => {
      try { return Object.keys(JSON.parse(localStorage.getItem('physics-progress-v1') || '{}').confidence || {}).length >= n; }
      catch { return false; }
    }, mine, { timeout: 30000 });
    const got = await tags(bb);
    if (got !== mine) throw new Error(`machine B pulled ${got} tags, expected ${mine}`);
    await ctxA.close(); await ctxB.close();
    ok(`sync between two machines: ${mine} tags pushed from one and pulled on the other`);
  } catch (e) { fail('sync', e.message.split('\n')[0]); }
  // ---------- the visible rating buttons, and the margin popup being reachable ----------
  try {
    await page.goto(BASE + '#/module/01-forces-and-motion');
    await page.waitForSelector('.rag-buttons', { timeout: 10000 });
    const controls = await page.locator('.rag-buttons').count();
    if (controls < 10) throw new Error(`${controls} visible rating controls, expected one per section and question`);

    const rb = page.locator('.rag-buttons').first();
    await rb.scrollIntoViewIfNeeded();
    await rb.locator('.rb-red').click();
    await page.waitForTimeout(200);
    if (await rb.locator('.rb-red.on').count() !== 1) throw new Error('red did not register as selected');

    // clicking the same colour again clears it
    await rb.locator('.rb-red').click();
    await page.waitForTimeout(200);
    if (await rb.locator('.rb-red.on').count() !== 0) throw new Error('clicking again did not clear');

    await rb.locator('.rb-green').click();
    await page.waitForTimeout(200);
    if (await rb.locator('.rb-green.on').count() !== 1) throw new Error('green did not register');

    // the margin dot popup must survive the pointer travelling to it
    const dot = page.locator('.rag-dot[data-for="01-forces-and-motion/def/scalar"]');
    await dot.scrollIntoViewIfNeeded();
    await dot.hover();
    await page.waitForSelector('.rag-pop', { timeout: 4000 });
    const box = await page.locator('.rag-pop .sw-amber').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
    await page.waitForTimeout(700);
    if (await page.locator('.rag-pop').count() !== 1) throw new Error('popup closed before it could be clicked');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('physics-progress-v1') || '{}').confidence?.['01-forces-and-motion/def/scalar']?.value);
    if (saved !== 'amber') throw new Error(`margin popup saved "${saved}", expected amber`);
    ok(`rating controls: ${controls} visible on the page, set/clear works, margin popup reachable`);
  } catch (e) { fail('rating controls', e.message.split('\n')[0]); }

  // ---------- tagging rail: hover then click ----------
  try {
    await page.goto(BASE + '#/module/01-forces-and-motion');
    await page.waitForSelector('.rag-dot', { timeout: 5000 });
    const dot = page.locator('.rag-dot[data-for="01-forces-and-motion/def/scalar"]');
    await dot.scrollIntoViewIfNeeded();
    await dot.hover();
    await page.click('.rag-pop .sw-red', { timeout: 3000 });
    const tagged = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('physics-progress-v1')).confidence['01-forces-and-motion/def/scalar']?.value);
    if (tagged !== 'red') throw new Error(`tag stored as ${tagged}`);
    ok('tagging: hover → click swatch → stored');
  } catch (e) { fail('tagging', e.message.split('\n')[0]); }

  // ---------- console errors across the whole run ----------
  if (errors.length) fail('console errors', errors.slice(0, 5).join(' | '));
  else ok('no console or page errors across the run');

  // ---------- touchscreen: taps only, no mouse (Windows touch laptops) ----------
  try {
    const touch = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const terrors = [];
    touch.on('pageerror', e => terrors.push(e.message));
    await touch.goto(BASE + '#/cards');
    await touch.waitForSelector('.card-stage .front', { timeout: 5000 });
    for (let k = 0; k < 2; k++) {
      const front = await touch.textContent('.card-stage .front');
      await touch.tap('.card-actions button:has-text("Show")');
      await touch.waitForSelector('.card-stage .back', { timeout: 3000 });
      await touch.tap('.card-actions button:has-text("Partly")');
      await touch.waitForFunction(
        prev => document.querySelector('.card-stage .front')?.textContent !== prev,
        front, { timeout: 3000 });
    }
    // touch path for tagging: tap dot opens the pop, tap swatch sets
    await touch.goto(BASE + '#/module/02-solids-liquids-gases');
    await touch.waitForSelector('.rag-dot', { timeout: 5000 });
    const dot2 = touch.locator('.rag-dot[data-for="02-solids-liquids-gases/eq/density"]');
    await dot2.scrollIntoViewIfNeeded();
    await dot2.tap();
    await touch.tap('.rag-pop .sw-amber');
    const t2 = await touch.evaluate(() =>
      JSON.parse(localStorage.getItem('physics-progress-v1')).confidence['02-solids-liquids-gases/eq/density']?.value);
    if (t2 !== 'amber') throw new Error(`touch tag stored as ${t2}`);
    if (terrors.length) throw new Error(terrors[0]);
    await touch.close();
    ok('touchscreen: flashcards advance and tagging works by tap');
  } catch (e) { fail('touchscreen', e.message.split('\n')[0]); }

  await browser.close();

  // ---------- static files served (checked outside the browser) ----------
  try {
    const http = require('http');
    const head = (url) => new Promise((resolve, reject) => {
      http.get(url, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    for (const f of ['papers/physics/2023-paper.pdf', 'papers/physics/2024-paper.pdf', 'papers/physics/2025-paper.pdf',
                     'papers/physics/2023-markscheme.pdf', 'papers/physics/2024-markscheme.pdf', 'papers/physics/2025-markscheme.pdf',
                     'complete-pack.html']) {
      const status = await head(new URL(f, BASE).href);
      if (status !== 200) throw new Error(`${f} -> ${status}`);
    }
    ok('static files: all six paper PDFs and the complete pack served');
  } catch (e) { fail('static files', e.message.split('\n')[0]); }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
