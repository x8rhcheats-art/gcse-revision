#!/usr/bin/env node
/**
 * bundle-pdf.js — the revision content as a PDF.
 *
 * HTML on iOS has proved unreliable: tapped files are shown through Quick Look,
 * which does not run JavaScript and evidently does not render our page either.
 * PDF has no such problem — iOS renders it natively in Mail, Files and Books,
 * with search, bookmarks and offline access.
 *
 * Answers cannot collapse in a PDF, so every answer is printed under its
 * question — which is exactly what the original pack's print styles already do.
 *
 * Output: John-<Subject>-Revision.pdf (default physics; pass a subject id)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
// which subject's phone copy to render: `node bundle-pdf.js chemistry`
const SUBJECT = process.argv[2] || 'physics';
const TITLE = SUBJECT.charAt(0).toUpperCase() + SUBJECT.slice(1);
const SRC = path.join(ROOT, `John-${TITLE}-Phone.html`);
const OUT = path.join(ROOT, `John-${TITLE}-Revision.pdf`);

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Run bundle-phone.js first — it produces the source page.');
    process.exit(1);
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + SRC.split(path.sep).join('/'));

  // A PDF cannot collapse, so open every answer and drop the on-screen chrome.
  await page.addStyleTag({
    content: `
      details.ans { break-inside: avoid; }
      details.ans summary { display: none !important; }
      details.ans .inner { display: block !important; border-top: 1px dashed var(--rule); }
      .totop, .pdf-hide { display: none !important; }
      /* the contents page stays, and its anchors become tappable PDF links */
      .toc { columns: 2; column-gap: 24px; }
      .toc a { break-inside: avoid; padding: 7px 2px; font-size: 13px; }
      body { background: #fff !important; background-image: none !important; font-size: 11pt; }
      .sheet { max-width: none; border: none; padding: 0; }
      h2 { break-before: page; }
      h2:first-of-type { break-before: avoid; }
      h3.big { break-after: avoid; }
      .q { break-inside: avoid; }
      table { break-inside: avoid; }
    `,
  });
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(d => { d.open = true; });

    // Keep the contents page: Chromium turns in-page anchors into real PDF
    // links, so it becomes a tappable index on the first page.

    // the standfirst tells the reader to tap, which makes no sense on paper
    const stand = document.querySelector('header.top .standfirst');
    if (stand) {
      stand.textContent = 'Everything in one document: all eight modules, 252 multiple-choice '
        + 'questions, the exam-technique rules and formula sheet, both mocks with mark schemes, '
        + 'and the full specification. Every answer is printed under its question. '
        + 'Search this PDF to find a topic quickly.';
    }
    // label the answers now that the summary is hidden
    document.querySelectorAll('details.ans .inner').forEach(inner => {
      const tag = document.createElement('p');
      tag.textContent = 'Answer';
      tag.style.cssText = 'font-family:var(--mono);font-size:9pt;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin:0 0 6px';
      inner.prepend(tag);
    });
  });
  await page.emulateMedia({ media: 'print' });

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    // builds the bookmark outline from the headings — this is the contents
    // sidebar iOS shows in Files and Books, and the whole point of the rebuild
    tagged: true,
    outline: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:8px;color:#666;width:100%;padding:0 14mm;">Physics Revision · Edexcel IGCSE 4PH1 · exam 7 September</div>',
    footerTemplate: '<div style="font-size:8px;color:#666;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });

  await browser.close();
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`wrote ${path.relative(ROOT, OUT)} — ${mb} MB`);
})().catch(e => { console.error(e); process.exit(1); });
