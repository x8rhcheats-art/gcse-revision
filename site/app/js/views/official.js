// views/official.js — the exam board's own past papers.
//
// Two shapes feed this page. The one that matters now is `boardPapers`: real
// PDFs sitting in site/papers/<subject>/, every paper with its mark scheme,
// listed newest first. The older `officialPapers` shape is links out to a site
// that hosts them, kept for any subject that still has no local copies.

import { activeSubject } from '../content.js';
import { el, view } from '../ui.js';

/** The local set: a row per paper, grouped by year. */
function renderLocal(subj, data) {
  const papers = data.papers;
  const years = papers.map(p => p.year);
  const root = view('Past papers',
    `Every ${subj.board} paper in the app — ${Math.min(...years)} to ${Math.max(...years)}, ` +
    'question paper and mark scheme, straight from the board.');

  root.append(el('div', { class: 'panel' },
    el('h4', {}, 'How to use them'),
    el('p', {}, el('strong', {}, 'Sit one properly before you mark it. '),
      'Print or open the paper, time yourself, and only open the mark scheme when you have finished. ' +
      'Save the newest papers for last — they are the closest thing to your exam.')));

  const link = (href, text) => href
    ? el('a', { href, target: '_blank', rel: 'noopener' }, text)
    : el('span', { class: 'plain-note' }, 'not in the app');

  let year = null, table = null;
  for (const p of papers) {
    if (p.year !== year) {
      year = p.year;
      root.append(el('h3', {}, String(year)));
      table = el('table', {},
        el('tr', {}, el('th', {}, 'Paper'), el('th', {}, 'Question paper'), el('th', {}, 'Mark scheme')));
      root.append(table);
    }
    table.append(el('tr', {},
      el('td', {}, el('strong', {}, `${p.series} · Paper ${p.paper}`),
        p.note ? el('span', { class: 'd' }, el('br'), p.note) : null),
      el('td', {}, link(p.paperFile, 'Open')),
      el('td', {}, link(p.markSchemeFile, 'Open'))));
  }

  root.append(el('p', { class: 'plain-note' },
    `${papers.length} papers. These are the exam board's copyright — they are here for John's own revision, ` +
    'and the app is not public.'));
  return root;
}

/** The older shape: a table of links out, two papers per series. */
function renderLinks(subj, data) {
  const papers = data.papers || [];
  const [code1, code2] = data.codes || ['Paper 1', 'Paper 2'];
  const root = view('Past papers',
    `The board's own International GCSE ${subj.title} papers (${subj.code}) — Paper ${code1} and Paper ${code2}.`);

  const link = (href, text) => href
    ? el('a', { href, target: '_blank', rel: 'noopener' }, text)
    : el('span', { class: 'plain-note' }, '—');

  let year = null, table = null;
  for (const p of papers) {
    const y = p.month === 0 ? 'Specimen' : String(p.year);
    if (y !== year) {
      year = y;
      root.append(el('h3', {}, y === 'Specimen' ? 'Specimen papers (2017)' : y));
      table = el('table', {},
        el('tr', {}, el('th', {}, 'Series'), el('th', {}, `Paper ${code1}`), el('th', {}, `Paper ${code2}`)));
      root.append(table);
    }
    table.append(el('tr', {},
      el('td', {}, el('strong', {}, p.series)),
      el('td', {}, link(p.paper1.qp, 'Paper'), ' · ', link(p.paper1.ms, 'Mark scheme')),
      el('td', {}, link(p.paper2.qp, 'Paper'), ' · ', link(p.paper2.ms, 'Mark scheme'))));
  }

  root.append(el('p', { class: 'plain-note' },
    'Hosted by ', el('a', { href: data.sourceUrl, target: '_blank', rel: 'noopener' }, data.source),
    `. Links checked ${data.checked}. The papers are Pearson Edexcel's copyright; this page only points to them.`));
  return root;
}

export function renderOfficial() {
  const subj = activeSubject();
  const board = subj.boardPapers;
  if (board && (board.papers || []).length) return renderLocal(subj, board);
  const data = subj.officialPapers;
  if (data && (data.papers || []).length) return renderLinks(subj, data);
  return view('Past papers', 'No board papers added for this subject yet.');
}
