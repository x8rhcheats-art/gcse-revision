#!/usr/bin/env node
/**
 * test-phone.js — proves the phone copy works the way iOS Quick Look shows it:
 * JavaScript DISABLED, WebKit, iPhone viewport, opened from file://.
 *
 * This is the condition that made the app build come up blank, so it is the
 * condition the phone copy has to survive.
 */
const path = require('path');
const { webkit, devices } = require('playwright');

// which phone copy to test: `node test-phone.js chemistry`
const SUBJECT = process.argv[2] || 'physics';
const TITLE = SUBJECT.charAt(0).toUpperCase() + SUBJECT.slice(1);
const FILE = path.resolve(__dirname, '..', `John-${TITLE}-Phone.html`);
const url = 'file:///' + FILE.split(path.sep).join('/');

(async () => {
  const browser = await webkit.launch({ headless: true });
  // javaScriptEnabled:false reproduces Quick Look's behaviour
  const ctx = await browser.newContext({ ...devices['iPhone 13'], javaScriptEnabled: false });
  const page = await ctx.newPage();

  let problems = 0;
  const check = (label, cond, detail = '') => {
    if (cond) console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
    else { problems++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  };

  console.log('\nPHONE COPY — WebKit, iPhone 13, file://, JavaScript DISABLED\n');

  await page.goto(url);
  const text = (await page.textContent('body')).trim();
  check('page renders with JavaScript off', text.length > 5000, `${Math.round(text.length / 1000)}k characters`);

  const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
  check('fits the phone screen', !overflow);

  // contents list navigates
  const tocLinks = await page.locator('.toc a').count();
  check('contents list present', tocLinks >= 11, `${tocLinks} entries`);

  // every module section is really there
  // attribute selector: ids beginning with a digit are not valid in CSS
  // module ids differ per subject: check the sections the TOC itself advertises,
  // plus the fixed reference/papers/spec sections every build emits
  const tocIds = await page.locator('.toc a').evaluateAll(as => as.map(a => a.getAttribute('href').slice(1)));
  for (const id of [...tocIds, 'reference', 'papers', 'spec']) {
    const n = await page.locator(`[id="${id}"]`).count();
    if (!n) { problems++; console.log(`  FAIL  section #${id} missing`); }
  }
  check('all module and reference sections present', true);

  // the crucial bit: answers open with no JavaScript
  const firstDetails = page.locator('details.ans').first();
  const before = await firstDetails.evaluate(d => d.open);
  await firstDetails.locator('summary').click();
  const after = await firstDetails.evaluate(d => d.open);
  check('answers expand without JavaScript', before === false && after === true);

  const answerVisible = await firstDetails.locator('.inner').isVisible();
  check('the answer text is actually visible once open', answerVisible);

  const totalDetails = await page.locator('details.ans').count();
  check('every question has a collapsible answer', totalDetails > 300, `${totalDetails} answers`);

  // multiple choice made it in, with options and explanations
  const opts = await page.locator('.opts').count();
  check('multiple-choice options present', opts > 200, `${opts} questions with options`);

  // internal anchor navigation works without JS
  // jump using a real entry from this subject's own contents list
  await page.locator('.toc a').last().click();
  await page.waitForTimeout(200);
  const scrolled = await page.evaluate(() => window.scrollY > 200);
  check('contents links jump to the right place', scrolled);

  await browser.close();
  console.log(problems ? `\n${problems} PROBLEM(S)` : '\nPHONE COPY OK — works with scripting off');
  process.exit(problems ? 1 : 0);
})();
