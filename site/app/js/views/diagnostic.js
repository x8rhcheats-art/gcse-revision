// views/diagnostic.js — the paper diagnostic (sat 8–9 Aug on paper).
// Entry is backdatable; scores + K/W/M/U/P error-code counts per section.

import { content, registry } from '../content.js';
import { el, view, shortDate, navigate } from '../ui.js';
import { saveDiagnosticAttempt, latestDiagnostic } from '../store.js';

const LETTERS = ['K', 'W', 'M', 'U', 'P'];

function entryForm(root) {
  const diag = content.diagnostic;
  const table = el('table', { class: 'entry' });
  table.append(el('tr', {},
    el('th', {}, '§'), el('th', {}, 'Topic'), el('th', {}, 'Score'), el('th', {}, 'Max'),
    ...LETTERS.map(l => el('th', { title: 'marks lost' }, l))));

  const scoreInputs = new Map(), codeInputs = new Map();
  for (const s of diag.sections) {
    const score = el('input', { type: 'number', class: 'score', min: 0, max: s.marks, inputmode: 'numeric' });
    scoreInputs.set(s.letter, score);
    const codes = LETTERS.map(l => {
      const inp = el('input', { type: 'number', class: 'code-n', min: 0, max: s.marks, inputmode: 'numeric' });
      codeInputs.set(`${s.letter}/${l}`, inp);
      return el('td', {}, inp);
    });
    table.append(el('tr', {},
      el('td', { class: 'num' }, s.letter),
      el('td', {}, s.moduleId
        ? el('a', { href: `#/module/${s.moduleId}` }, s.title)
        : s.title),
      el('td', {}, score),
      el('td', { class: 'num' }, `/${s.marks}`),
      ...codes));
  }
  root.append(table);

  const date = el('input', { type: 'date', value: '2026-08-09' });
  const finished = el('input', { type: 'checkbox' });
  const blanks = el('input', { type: 'text', class: 'wide', placeholder: 'e.g. E4, G3 — or leave empty' });
  root.append(
    el('p', {}, 'Date sat: ', date),
    el('p', {}, el('label', {}, finished, ' Finished within the 70 minutes')),
    el('p', {}, 'Questions left blank: ', el('br'), blanks));

  const warn = el('p', { class: 'entry-warn' });
  root.append(warn);

  root.append(el('p', {}, el('button', {
    class: 'act', onclick: () => {
      const sections = [];
      for (const s of diag.sections) {
        const raw = scoreInputs.get(s.letter).value;
        if (raw === '') { warn.textContent = `Section ${s.letter} has no score.`; return; }
        const score = Number(raw);
        if (Number.isNaN(score) || score < 0 || score > s.marks) { warn.textContent = `Section ${s.letter}: score must be 0–${s.marks}.`; return; }
        const codes = {};
        let coded = 0;
        for (const l of LETTERS) {
          const n = Number(codeInputs.get(`${s.letter}/${l}`).value || 0);
          if (n > 0) { codes[l] = n; coded += n; }
        }
        if (coded > s.marks - score) { warn.textContent = `Section ${s.letter}: ${coded} marks coded as lost, but only ${s.marks - score} were lost.`; return; }
        sections.push({ letter: s.letter, score, marks: s.marks, codes });
      }
      saveDiagnosticAttempt({
        at: new Date(date.value + 'T12:00:00').toISOString(),
        sections, finishedInTime: finished.checked,
        blankQuestions: blanks.value.trim() || null,
      });
      navigate('#/coach');
    },
  }, 'Save')));
}

export function renderDiagnostic() {
  const diag = content.diagnostic;
  const total = diag.sections.reduce((a, s) => a + s.marks, 0);
  const root = view('Diagnostic', `${total} marks · ${diag.minutes} minutes · sat on paper, 8–9 August. The result decides where the time goes.`);

  root.append(el('p', {},
    el('a', { class: 'act', href: `diagnostic/${registry.activeId}/diagnostic.html`, target: '_blank' }, 'The paper'), ' ',
    el('a', { class: 'act secondary', href: `diagnostic/${registry.activeId}/diagnostic-markscheme.html`, target: '_blank' }, 'Mark scheme')));

  const existing = latestDiagnostic();
  if (existing) {
    const sum = existing.sections.reduce((a, s) => a + s.score, 0);
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Result'), 'Entered'),
      el('p', {}, `${sum}/${total}, sat ${shortDate(existing.at)}. ` +
        (existing.finishedInTime ? 'Finished in time.' : 'Did not finish in time.') +
        (existing.blankQuestions ? ` Left blank: ${existing.blankQuestions}.` : '')));
    const t = el('table', {});
    t.append(el('tr', {}, el('th', {}, '§'), el('th', {}, 'Topic'), el('th', {}, 'Score'), el('th', {}, 'Codes')));
    for (const s of existing.sections) {
      const spec = diag.sections.find(x => x.letter === s.letter);
      t.append(el('tr', {},
        el('td', { class: 'num' }, s.letter),
        el('td', {}, spec ? spec.title : ''),
        el('td', { class: 'num' }, `${s.score}/${s.marks}`),
        el('td', { class: 'num' }, Object.entries(s.codes || {}).map(([l, n]) => `${l}×${n}`).join(' ') || '—')));
    }
    root.append(t);
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Re-enter'), 'Replace with a corrected entry'));
  } else {
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Entry'), 'Enter the marked result'));
  }
  entryForm(root);
  return root;
}
