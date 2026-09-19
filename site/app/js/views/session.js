// views/session.js — build a practice session from the confidence model.
//
// The app already knows which modules need work; this is where that knowledge
// becomes a choice. Pick modules (or let the model pick them), then choose what
// to practise. The selection travels in the URL as module numbers, so every
// session is bookmarkable and survives a reload.

import { content, modsToParam, activeSubject, inGroup } from '../content.js';
import { el, view, navigate, modeSwitch } from '../ui.js';
import { getPref, setPref } from '../store.js';
import { modulesByNeed, modulesWithRed, redItemsByModule, dueCards } from '../model.js';

const STATE_LABELS = {
  'blind-spot': 'blind spot', 'known-gap': 'known gap', 'confidence-gap': 'confidence gap',
  'secure': 'secure', 'unverified': 'unverified', 'unknown': 'unknown', 'mixed-evidence': 'mixed evidence',
};
const LENGTHS = [10, 20, 30, 'all'];

export function renderSession() {
  const root = view('Build a session',
    'Choose the modules — or let the app choose them from what you have tagged and how you have scored — then pick what to practise.');

  const needs = modulesByNeed();
  const redCounts = redItemsByModule();
  const selected = new Set();
  let length = 20;
  let mode = getPref('mode.mcq', 'even');

  // How questions get chosen — the same choice the practice views offer.
  root.append(modeSwitch('Question choice', [
    { value: 'even', label: 'Even — full coverage' },
    { value: 'weak', label: 'Weighted to weak topics' },
  ], mode, (v) => {
    mode = v;
    setPref('mode.mcq', v);
    setPref('mode.drill', v);
    navigate('#/practice');
  }));

  // ---- selection summary + launch buttons, rebuilt on every change ----
  const summary = el('p', { class: 'plain-note' });
  const launch = el('div', { class: 'card-actions', style: 'margin-top:6px' });

  function param() { return modsToParam([...selected]); }

  function refresh() {
    for (const chip of chipEls) {
      chip.el.classList.toggle('on', selected.has(chip.moduleId));
    }
    const n = selected.size;
    if (!n) {
      summary.textContent = 'No modules selected — sessions will draw on everything, weighted towards what needs work.';
    } else {
      const due = dueCards(new Date(), [...selected]).length;
      summary.textContent = `${n} module${n === 1 ? '' : 's'} selected · ` +
        `${[...selected].reduce((a, id) => a + (redCounts.get(id) || 0), 0)} red items · ${due} cards due.`;
    }
    // A module can legitimately hold no questions of a given kind — a topic
    // added for next year, say. Offering the launch anyway lands the user on
    // "not found", so the button says why instead of being a dead end.
    const mcqCount = [...selected].reduce((a, id) => a + (content.mcq[id] || []).length, 0);
    const noMcq = n > 0 && mcqCount === 0;
    launch.replaceChildren(
      el('button', {
        class: noMcq ? 'act secondary' : 'act',
        disabled: noMcq || undefined,
        title: noMcq ? 'The selected module has no multiple choice questions yet' : undefined,
        onclick: () => go('mcq'),
      }, noMcq ? 'No multiple choice here yet' : 'Multiple choice'),
      el('button', { class: 'act', onclick: () => go('drill') }, 'Drill questions'),
      el('button', { class: 'act', onclick: () => go('cards') }, 'Flashcards'));
  }

  function go(kind) {
    const p = param();
    const q = new URLSearchParams();
    if (p) q.set('mods', p);
    if (kind !== 'cards') q.set('n', String(length));   // "all" passes through
    if (kind === 'cards') q.set('mode', mode === 'weak' ? 'weak' : 'module');
    else q.set('mode', mode);
    if (kind === 'mcq') navigate(`#/mcq/${p ? 'custom' : 'all'}?${q}`);
    else if (kind === 'drill') navigate(`#/mix-drill?${q}`);
    else navigate(`#/cards?${q}`);
  }

  // ---- presets ----
  const presets = el('div', { class: 'card-actions' },
    el('button', {
      class: 'act secondary', onclick: () => {
        selected.clear();
        for (const id of modulesWithRed()) selected.add(id);
        refresh();
      },
    }, 'My red topics'),
    el('button', {
      class: 'act secondary', onclick: () => {
        selected.clear();
        for (const m of needs.slice(0, 3)) selected.add(m.moduleId);
        refresh();
      },
    }, 'Weakest three'),
    el('button', {
      class: 'act secondary', onclick: () => {
        selected.clear();
        for (const m of content.modules) selected.add(m.id);
        refresh();
      },
    }, 'Everything'),
    // one button per year for subjects split into Year 10 / Year 11
    ...(activeSubject().moduleGroups || []).map(g => el('button', {
      class: 'act secondary', onclick: () => {
        selected.clear();
        for (const m of content.modules) if (inGroup(g, m)) selected.add(m.id);
        refresh();
      },
    }, `${g.title} only`)),
    el('button', { class: 'act secondary', onclick: () => { selected.clear(); refresh(); } }, 'Clear'));
  root.append(presets);

  // ---- module chips, ordered by need so the top of the list is the answer ----
  root.append(el('h2', {}, el('span', { class: 'num' }, 'Modules'), 'Most in need of work first'));
  const chipEls = [];
  const grid = el('div', { class: 'mod-picker' });
  for (const m of needs) {
    const chip = el('button', {
      class: 'mod-chip', onclick: () => {
        if (selected.has(m.moduleId)) selected.delete(m.moduleId); else selected.add(m.moduleId);
        refresh();
      },
    },
      el('span', { class: 'mc-title' }, m.title),
      el('span', { class: 'mc-meta' },
        el('span', { class: `state-chip ${m.state}` }, STATE_LABELS[m.state]),
        ` ~${Math.round((m.examWeight || 0) * 100)}% of marks`,
        m.reds ? ` · ${m.reds} red` : '',
        m.demonstrated.available ? ` · ${Math.round(m.demonstrated.pct * 100)}% of ${Math.round(m.demonstrated.available)} marks` : ' · untested'));
    chipEls.push({ el: chip, moduleId: m.moduleId });
    grid.append(chip);
  }
  root.append(grid);

  // ---- length ----
  root.append(el('h2', {}, el('span', { class: 'num' }, 'Length'), 'How many questions'));
  const lengthRow = el('div', { class: 'card-actions' });
  const lengthBtns = LENGTHS.map(n => el('button', {
    class: `act secondary${n === length ? ' current' : ''}`,
    onclick: () => {
      length = n;
      lengthBtns.forEach((b, k) => b.classList.toggle('current', LENGTHS[k] === length));
    },
  }, n === 'all' ? 'Everything' : String(n)));
  lengthRow.append(...lengthBtns);
  root.append(lengthRow, el('p', { class: 'plain-note' },
    '“Everything” runs every question in the selected modules. Flashcards always show the complete deck.'));

  root.append(el('h2', {}, el('span', { class: 'num' }, 'Start'), 'What do you want to do'), summary, launch);
  refresh();
  return root;
}
