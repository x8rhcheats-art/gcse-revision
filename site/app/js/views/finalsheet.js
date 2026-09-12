// views/finalsheet.js — the one side of A4 for 1–2 September.
//
// The Mock 2 mark scheme prescribes exactly this: "Take every mark lost, write
// it as a single line on one side of A4, and read that sheet on the 1st and
// 2nd." Every input already lives in the app, so it writes itself: the red
// items, the wrong answers, the error-code pattern, and the equations that must
// be in his head. Dense, printable, no new material.

import { content, index, moduleTitle, modulesByWeight, activeSubject } from '../content.js';
import { el, view } from '../ui.js';
import { getState } from '../store.js';
import { redList, errorCodeDistribution, allModuleStates, effectiveTag, daysToExam } from '../model.js';
import { wrongAttempts } from './review.js';

const CODE_LABELS = {
  knowledge: 'Knowledge', wording: 'Wording', maths: 'Maths',
  'unit-conversion': 'Unit conversion', presentation: 'Presentation',
};

export function renderFinalSheet() {
  const root = view('The last sheet',
    'Everything still costing you marks, on one page. Print it, read it on the 1st and 2nd, and do not start anything new.');
  root.classList.add('finalsheet');

  const days = daysToExam();
  root.append(el('p', { class: 'plain-note no-print' },
    `${days === null ? 'Built' : `${days} day${days === 1 ? '' : 's'} to the exam. Built`} from your tags, your wrong answers and your marked papers — it changes as they do.`,
    ' ',
    el('a', { href: '#', onclick: (e) => { e.preventDefault(); window.print(); } }, 'Print this page')));

  // 1 — wording and technique first: cheapest marks in the room
  const st = getState();
  const techRules = ((content.reference && content.reference.techniqueRules) || [])
    .filter(r => { const t = effectiveTag(r.itemId); return t && t.value !== 'green'; });
  const block1 = el('section', {}, el('h2', {}, el('span', { class: 'num' }, '01'), 'Technique you keep losing marks on'));
  if (techRules.length) {
    block1.append(el('ul', {}, ...techRules.map(r => el('li', {}, el('strong', {}, r.rule)))));
  } else {
    block1.append(el('p', { class: 'plain-note' },
      'No technique rules tagged. The universal three: convert units before substituting · if it says “state the formula”, write it · if it says “in terms of forces”, do not mention energy.'));
  }
  root.append(block1);

  // 2 — the error-code pattern from real marked papers
  const codes = errorCodeDistribution();
  const totalLost = Object.values(codes).reduce((a, n) => a + n, 0);
  if (totalLost) {
    const ranked = Object.entries(codes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    root.append(el('section', {},
      el('h2', {}, el('span', { class: 'num' }, '02'), 'Where your marks actually went'),
      el('ul', {}, ...ranked.map(([code, n]) =>
        el('li', {}, el('strong', {}, `${n} mark${n === 1 ? '' : 's'}`), ` — ${CODE_LABELS[code] || code}`))),
      el('p', { class: 'plain-note' },
        ranked[0] && ranked[0][0] !== 'knowledge'
          ? `Your biggest loss is ${(CODE_LABELS[ranked[0][0]] || '').toLowerCase()}, not ${activeSubject().title.toLowerCase()}. That is fixable by reading this sheet, not by learning anything new.`
          : 'Most losses are knowledge gaps — see the red topics below.')));
  }

  // 3 — red items, grouped, heaviest module first
  const { explicit } = redList();
  const byModule = new Map();
  for (const r of explicit) {
    const mid = r.info.moduleId || 'technique';
    if (!byModule.has(mid)) byModule.set(mid, []);
    byModule.get(mid).push(r);
  }
  const block3 = el('section', {}, el('h2', {}, el('span', { class: 'num' }, '03'), 'Still red'));
  if (explicit.length) {
    for (const m of modulesByWeight()) {
      const list = byModule.get(m.id);
      if (!list) continue;
      block3.append(el('p', { class: 'fs-line' },
        el('strong', {}, m.title), ' — ',
        list.map(r => r.info.label).join(' · ')));
    }
  } else block3.append(el('p', { class: 'plain-note' }, 'Nothing tagged red.'));
  root.append(block3);

  // 4 — questions still wrong
  const wrong = wrongAttempts();
  if (wrong.length) {
    const byMod = new Map();
    for (const r of wrong) {
      const mid = r.entry.moduleId || (r.entry.moduleIds && r.entry.moduleIds[0]) || 'other';
      byMod.set(mid, (byMod.get(mid) || 0) + 1);
    }
    root.append(el('section', {},
      el('h2', {}, el('span', { class: 'num' }, '04'), 'Questions you got wrong'),
      el('p', { class: 'fs-line' },
        [...byMod.entries()].sort((a, b) => b[1] - a[1])
          .map(([mid, n]) => `${moduleTitle(mid)} (${n})`).join(' · ')),
      el('p', { class: 'plain-note no-print' },
        el('a', { href: '#/review' }, 'Work through them'))));
  }

  // 5 — the equations that must be in his head
  const memorise = index.cards.filter(c => c.type === 'equation' && c.meta === 'must memorise');
  const eqBlock = el('section', {}, el('h2', {}, el('span', { class: 'num' }, '05'), `The ${memorise.length} equations not on the formula sheet`));
  for (const c of memorise) {
    eqBlock.append(el('p', { class: 'fs-line' },
      el('strong', {}, c.front), ' — ', el('code', {}, c.backHtml.replace(/<[^>]+>/g, ''))));
  }
  root.append(eqBlock);

  // 6 — blind spots, if any survive
  const blind = allModuleStates().filter(s => s.state === 'blind-spot');
  if (blind.length) {
    root.append(el('section', {},
      el('h2', {}, el('span', { class: 'num' }, '06'), 'Rated green, performing weak'),
      el('ul', {}, ...blind.map(s => el('li', {},
        el('strong', {}, s.title), ' — ',
        (s.demonstrated.weakQuestions[0]?.label) || 'weak on the evidence so far')))));
  }

  root.append(el('footer', {}, 'Read this on 1 and 2 September. No new material.'));
  return root;
}
