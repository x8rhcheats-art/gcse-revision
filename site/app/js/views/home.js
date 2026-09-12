// views/home.js — quiet landing view. Counts of work, never percentages.

import { content, modulesByWeight, activeSubject } from '../content.js';
import { el, view, shortDate } from '../ui.js';
import { getState, latestMockAttempt, latestDiagnostic, toggleChecklist, exportJson, importJson } from '../store.js';
import { redCount, dueCards, daysToExam } from '../model.js';
import { wrongAttempts } from './review.js';

export function renderHome() {
  const subj = activeSubject();
  const root = view(`${subj.title} Revision`,
    subj.board + (subj.standfirst ? ` · ${subj.standfirst}` : ''));
  const days = daysToExam();
  if (days !== null) {
    root.querySelector('.vhead').append(
      el('p', { class: 'plain-note' }, `${days} day${days === 1 ? '' : 's'} until the exam.`));
  }

  // work entry points
  const reds = redCount();
  const due = dueCards().length;
  const wrong = wrongAttempts().length;
  const work = el('section', {});
  work.append(
    el('a', { class: 'rowlink', href: '#/red' },
      el('span', { class: 't' }, 'Work on your red topics'),
      el('span', { class: 'r' }, reds ? `${reds} item${reds === 1 ? '' : 's'}` : 'nothing tagged red')),
    el('a', { class: 'rowlink', href: '#/review' },
      el('span', { class: 't' }, 'Get these right'),
      el('span', { class: 'r' }, wrong ? `${wrong} you got wrong` : 'nothing wrong yet')),
    el('a', { class: 'rowlink', href: '#/cards' },
      el('span', { class: 't' }, 'Flashcards'),
      el('span', { class: 'r' }, due ? `${due} to review today` : 'all reviewed for today')),
    el('a', { class: 'rowlink', href: '#/eq-drill' },
      el('span', { class: 't' }, 'Equation drill'),
      el('span', { class: 'r' }, '30 seconds a card')),
    el('a', { class: 'rowlink', href: '#/mix-drill' },
      el('span', { class: 't' }, 'Mixed practice'),
      el('span', { class: 'r' }, 'questions across modules, weighted to red')),
    el('a', { class: 'rowlink', href: '#/mcq' },
      el('span', { class: 't' }, 'Multiple choice'),
      el('span', { class: 'r' }, 'per module, or weighted to your weakest')),
    el('a', { class: 'rowlink', href: '#/practice' },
      el('span', { class: 't' }, 'Build a session'),
      el('span', { class: 'r' }, 'pick modules, or let the app pick them')),
  );
  root.append(work);

  // modules
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const n = content.modules.length;
  const mods = el('section', {}, el('h2', {}, el('span', { class: 'num' }, 'Modules'),
    n ? `The ${NUMBER_WORDS[n] || n} module${n === 1 ? '' : 's'}` : 'Being built'));
  if (!n) {
    mods.append(el('p', { class: 'plain-note' },
      'Nothing here yet — the modules for this subject are being built from the school material. They will appear here as they land.'));
  }

  // assembled from the confidence model, so it leads the list
  mods.append(el('a', { class: 'rowlink', href: '#/priority' },
    el('span', {},
      el('span', { class: 't' }, 'Priority Module'),
      el('br'),
      el('span', { class: 'd' }, 'One module’s worth of material, drawn from whatever currently needs the most work')),
    el('span', { class: 'r' }, 'rebuilt every visit')));
  const moduleRow = m => el('a', { class: 'rowlink', href: `#/module/${m.id}` },
    el('span', {},
      el('span', { class: 't' }, m.title),
      el('br'),
      el('span', { class: 'd' }, m.standfirst)),
    el('span', { class: 'r' }, m.examWeight != null ? `~${Math.round(m.examWeight * 100)}% of marks` : ''));
  // A subject with year groups lists each year under its own heading, heaviest
  // first within the year; otherwise it is one list ordered by weight.
  const groups = subj.moduleGroups || [];
  if (groups.length) {
    for (const g of groups) {
      const inGroup = modulesByWeight().filter(m => m.number >= g.from && m.number <= g.to);
      if (!inGroup.length) continue;
      mods.append(el('h3', {}, g.title));
      for (const m of inGroup) mods.append(moduleRow(m));
    }
  } else {
    for (const m of modulesByWeight()) mods.append(moduleRow(m));
  }
  if (subj.completePack) {
    mods.append(el('a', { class: 'rowlink', href: subj.completePack, target: '_blank' },
      el('span', {},
        el('span', { class: 't' }, 'Complete pack'),
        el('br'),
        el('span', { class: 'd' }, 'All eight modules and both mocks on one page — for reading straight through or printing')),
      el('span', { class: 'r' }, 'opens in a new tab')));
  }
  root.append(mods);

  // papers — only what this subject actually has
  const hasPapers = content.diagnostic || content.mocks.length || content.pastPapers.length;
  const papers = el('section', {}, el('h2', {}, el('span', { class: 'num' }, 'Papers'),
    content.diagnostic ? 'Diagnostic and mocks' : 'Mocks and past papers'));
  if (content.diagnostic) {
    const diag = latestDiagnostic();
    papers.append(el('a', { class: 'rowlink', href: '#/diagnostic' },
      el('span', { class: 't' }, 'Diagnostic'),
      el('span', { class: 'r' }, diag ? `entered · sat ${shortDate(diag.at)}` : 'results not yet entered')));
  }
  for (const mock of content.mocks) {
    const att = latestMockAttempt(mock.id);
    papers.append(el('a', { class: 'rowlink', href: `#/mock/${mock.id}` },
      el('span', { class: 't' }, mock.title),
      el('span', { class: 'r' }, att
        ? `sat ${shortDate(att.at)} · ${att.totalScore}/${att.totalMarks}`
        : `target ${shortDate(mock.targetDate)}`)));
  }
  // A subject can split its papers into groups (biology: Year 10 exams and
  // Year 11 mocks). Papers without a group list straight on, as before.
  let lastGroup = null;
  for (const paper of content.pastPapers) {
    if (paper.group && paper.group !== lastGroup) {
      papers.append(el('h3', {}, paper.group));
      lastGroup = paper.group;
    }
    const att = latestMockAttempt(paper.id);
    papers.append(el('a', { class: 'rowlink', href: `#/mock/${paper.id}` },
      el('span', {},
        el('span', { class: 't' }, paper.title),
        el('br'),
        el('span', { class: 'd' }, paper.note || 'Genuine school paper — revise it untimed, or sit it timed in the final fortnight')),
      el('span', { class: 'r' }, att
        ? `sat ${shortDate(att.at)} · ${att.totalScore}/${att.totalMarks}`
        : `${paper.totalMarks} marks`)));
  }
  if (hasPapers) root.append(papers);

  // the 27 days, as a checklist — only for a subject with a dated plan
  const st = getState();
  if ((content.meta.schedule || []).length) {
    const plan = el('section', {}, el('h2', {}, el('span', { class: 'num' }, 'Schedule'), 'The 27 days'));
    const table = el('table', {});
    content.meta.schedule.forEach((row) => {
      // keyed by the dates string, not array position — survives schedule edits
      const key = row.dates;
      const done = !!st.checklist[key];
      table.append(el('tr', {},
        el('td', { style: 'width:34%' }, row.dates),
        el('td', {}, row.what),
        el('td', { style: 'width:44px;text-align:right' },
          el('input', { type: 'checkbox', ...(done ? { checked: '' } : {}), onchange: () => toggleChecklist(key) }))));
    });
    plan.append(table);
    root.append(plan);
  }

  // quiet footer: coach + data safety
  const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  file.addEventListener('change', async () => {
    if (!file.files.length) return;
    const text = await file.files[0].text();
    try {
      if (confirm('Replace the progress stored in this browser with the contents of this file?')) {
        importJson(text); location.reload();
      }
    } catch (err) { alert(err.message); }
  });
  root.append(el('footer', {},
    el('a', { href: '#/reference' }, 'Exam reference'), ' · ',
    el('a', { href: '#/spec' }, 'Specification'), ' · ',
    el('a', { href: '#/final' }, 'The last sheet'), ' · ',
    el('a', { href: '#/coach' }, 'Coach view'), ' · ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); exportJson(); } }, 'Back up progress'), ' · ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); file.click(); } }, 'Restore from backup'),
    file));
  return root;
}
