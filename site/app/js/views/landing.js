// views/landing.js — the front door. One card per subject, nothing else.
//
// This is the only view that stands outside a subject: it reads the registry,
// never a subject's content, so it costs nothing to render and works even for
// subjects whose content has not been written yet.

import { registry } from '../content.js';
import { el } from '../ui.js';
import { exportJson, importJson } from '../store.js';

const msDay = 86400000;

export function renderLanding() {
  const root = el('div', { class: 'view landing' });

  root.append(el('header', { class: 'vhead' },
    el('p', { class: 'eyebrow' }, 'John’s revision · GCSE 2027'),
    el('h1', {}, 'Pick a subject'),
    el('p', { class: 'standfirst' }, 'Everything lives in one app now. Progress, tags and scores are kept separately per subject.')));

  const grid = el('div', { class: 'subject-cards' });
  for (const s of registry.subjects) {
    const hasContent = (s.moduleCount || 0) > 0;
    // same arithmetic as model.js daysToExam, so the two never disagree
    const days = s.examDate
      ? Math.max(0, Math.round((new Date(s.examDate) - Date.now()) / msDay))
      : null;

    const stats = hasContent
      ? [`${s.moduleCount} modules`,
         s.mcqCount ? `${s.mcqCount} multiple choice` : null,
         s.paperCount ? `${s.paperCount} papers` : null].filter(Boolean).join(' · ')
      : 'content being built — nothing to revise yet';

    grid.append(el('a', { class: `subject-card${hasContent ? '' : ' empty'}`, 'data-subj': s.id, href: `#/${s.id}/home` },
      el('span', { class: 'sc-board' }, s.board),
      el('span', { class: 'sc-title' }, s.title),
      el('span', { class: 'sc-stats' }, stats),
      days !== null
        ? el('span', { class: 'sc-exam urgent' }, `${days} day${days === 1 ? '' : 's'} until the exam`)
        : el('span', { class: 'sc-exam' }, hasContent ? 'no exam date — long-haul revision' : 'material collected, modules on the way'),
      el('span', { class: 'sc-go' }, hasContent ? 'Open →' : 'Have a look →')));
  }
  root.append(grid);

  // one backup covers every subject, so the controls belong out here too
  const file = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  file.addEventListener('change', async () => {
    if (!file.files.length) return;
    const text = await file.files[0].text();
    try {
      if (confirm('Replace the progress stored in this browser (all subjects) with the contents of this file?')) {
        importJson(text); location.reload();
      }
    } catch (err) { alert(err.message); }
  });
  root.append(el('p', { class: 'landing-foot' },
    'Progress lives in this browser, per subject. ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); exportJson(); } }, 'Back up everything'), ' · ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); file.click(); } }, 'Restore from backup'),
    file));

  return root;
}
