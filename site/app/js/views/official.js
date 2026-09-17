// views/official.js — the real Edexcel International GCSE papers.
//
// The school papers elsewhere in the app are practice for school exams. These
// are the board's own papers, the ones Year 11 builds towards. They are links
// only: the PDFs stay on the site that hosts them, nothing is copied in, so
// there are no transcribed mark schemes here and no timed mode.

import { activeSubject } from '../content.js';
import { el, view } from '../ui.js';

export function renderOfficial() {
  const subj = activeSubject();
  const data = subj.officialPapers;
  const papers = (data && data.papers) || [];
  const [code1, code2] = (data && data.codes) || ['Paper 1', 'Paper 2'];

  const root = view('Real Edexcel papers',
    `The board's own International GCSE ${subj.title} papers (${subj.code}), for triple science — Paper ${code1} and Paper ${code2}. ` +
    'These are what the Year 11 exam looks like. Sit one timed, then mark it against the official mark scheme.');

  if (!papers.length) {
    root.append(el('p', { class: 'plain-note' }, 'No real papers added for this subject yet.'));
    return root;
  }

  root.append(el('div', { class: 'panel' },
    el('h4', {}, 'How to use them'),
    el('p', {}, el('strong', {}, 'Both papers count. '),
      `Paper ${code1} is 2 hours; Paper ${code2} is 1 hour 15 minutes and covers extra triple-science content. ` +
      'Start with the most recent June series — it is closest to your exam — and keep the older ones for the last few weeks.'),
    el('p', {}, 'Open the paper, time yourself, and only open the mark scheme once you have finished.')));

  const link = (href, text) => href
    ? el('a', { href, target: '_blank', rel: 'noopener' }, text)
    : el('span', { class: 'plain-note' }, '—');

  let year = null;
  let table = null;
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
