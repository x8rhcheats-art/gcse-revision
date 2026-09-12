// views/practice.js — flashcards, equation drill, mixed-topic drill.
// Queue order comes from the confidence model: red first, always.

import { content, index, moduleTitle, paramToMods } from '../content.js';
import { el, view, navigate, modeSwitch, attachKeys } from '../ui.js';
import { rateCard, getPref, setPref } from '../store.js';
import { dueCards, cardQueue, nextDue, effectiveTag, questionNeedWeight, weightedSample } from '../model.js';
import { attachCapture } from '../capture.js';
import { questionBlock } from '../question.js';


// ---------- shared card navigation: Back / Skip / Index ----------

/**
 * Builds the Back · Next · Index controls for any card/question session.
 * `jump(n)` re-renders at position n (clamped by the caller's show()).
 * The index panel lists every item so any position is one click away.
 * `labelFor(item, n)` supplies the index row text; defaults to card fronts.
 */
function cardNav({ queue, getIndex, jump, labelFor }) {
  const panel = el('div', { class: 'card-index', style: 'display:none' });
  const label = labelFor || ((card) => {
    const eff = effectiveTag(card.cardId);
    return [card.front, ` — ${moduleTitle(card.moduleId)}${eff ? ' · ' + eff.value : ''}`];
  });

  function rebuildPanel() {
    panel.replaceChildren();
    queue.forEach((item, n) => {
      const [main, meta] = [].concat(label(item, n));
      panel.append(el('button', {
        class: n === getIndex() ? 'current' : '',
        onclick: () => { jump(n); rebuildPanel(); },
      },
        `${String(n + 1).padStart(2, ' ')}. ${main}`,
        meta ? el('span', { class: 'ix-meta' }, meta) : null));
    });
  }

  const controls = el('div', { class: 'card-actions', style: 'margin-top:14px' },
    el('button', { class: 'act secondary', onclick: () => { jump(Math.max(0, getIndex() - 1)); rebuildPanel(); } }, '← Back'),
    el('button', { class: 'act secondary', onclick: () => { jump(getIndex() + 1); rebuildPanel(); } }, 'Next →'),
    el('button', {
      class: 'act secondary', onclick: () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : '';
        if (!open) rebuildPanel();
      },
    }, 'Index'));

  return { controls, panel, rebuildPanel };
}

/** The full deck in syllabus order — module 1 to 8, as authored. */
function orderedByModule(moduleIds = null) {
  return index.cards.filter(c => !moduleIds || moduleIds.includes(c.moduleId));
}

// ---------- flashcards ----------

export function renderCards(query = {}) {
  const mods = paramToMods(query.mods);
  const root = view('Flashcards',
    mods
      ? `${mods.map(moduleTitle).join(' · ')}. Red-tagged items first; nothing is ever hidden.`
      : 'Every equation, definition and vocabulary card, always. Rating a card moves it down the queue for a few days — nothing is ever hidden. Red-tagged items come first.');
  if (mods) root.append(el('p', { class: 'plain-note' },
    el('a', { href: '#/cards' }, 'Show the whole deck instead'), ' · ',
    el('a', { href: '#/practice' }, 'change selection')));

  // Order is his choice: needs-work first, or straight through by module.
  const order = query.mode || getPref('mode.cards', 'weak');
  root.append(modeSwitch('Card order', [
    { value: 'weak', label: 'Needs work first' },
    { value: 'module', label: 'Module order' },
  ], order, (v) => {
    setPref('mode.cards', v);
    navigate(`#/cards?${new URLSearchParams({ ...(mods ? { mods: query.mods } : {}), mode: v })}`);
  }));

  const queue = order === 'module'
    ? orderedByModule(mods)
    : cardQueue(new Date(), mods);
  const dueCount = dueCards(new Date(), mods).length;
  const counter = el('p', { class: 'plain-note' });
  root.append(counter);
  const stage = el('div', {});

  let i = 0;
  const jump = (n) => { i = Math.min(Math.max(0, n), queue.length); show(); };
  const nav = cardNav({ queue, getIndex: () => i, jump });
  root.append(stage, nav.controls, nav.panel);

  function show() {
    stage.replaceChildren();
    if (i >= queue.length) {
      counter.textContent = '';
      stage.append(el('p', {}, 'End of the deck.'));
      return;
    }
    counter.textContent = `Card ${i + 1} of ${queue.length}` +
      (dueCount ? ` · ${dueCount} scheduled for review today.` : '.');
    const card = queue[i];
    const eff = effectiveTag(card.cardId);
    const cardEl = el('div', { class: 'card-stage' },
      el('p', { class: 'card-meta' }, `${card.type} · ${moduleTitle(card.moduleId)}${card.meta ? ' · ' + card.meta : ''}${eff ? ' · tagged ' + eff.value : ''}`),
      el('p', { class: 'card-prompt' }, card.prompt),
      el('p', { class: 'front' }, card.front));
    const actions = el('div', { class: 'card-actions' });
    const reveal = el('button', { class: 'act', onclick: () => {
      cardEl.append(el('div', { class: 'back', html: card.backHtml }));
      actions.replaceChildren(
        el('button', { class: 'act secondary', onclick: () => rate('no-idea') }, 'No idea'),
        el('button', { class: 'act secondary', onclick: () => rate('partly') }, 'Partly'),
        el('button', { class: 'act secondary', onclick: () => rate('got-it') }, 'Got it'));
    } }, 'Show');
    actions.append(reveal);
    stage.append(cardEl, actions);

    function rate(rating) {
      rateCard(card.cardId, rating, nextDue(rating));
      i++; show();
    }
  }
  show();
  cardKeys(root);
  return root;
}

// ---------- equation drill ----------

export function renderEqDrill(query = {}) {
  const memoriseOnly = query.only === 'memorise';
  const isMemorise = c => c.meta === 'must memorise';
  const all = index.cards.filter(c => c.type === 'equation');
  const memoriseCount = all.filter(isMemorise).length;

  const root = view('Equation drill',
    `Thirty seconds a card. ${memoriseCount} of these ${all.length} equations are NOT on the exam formula sheet — those are the ones that have to be in your head, and they come first.`);
  root.append(el('p', {},
    el('a', { class: `act${memoriseOnly ? '' : ' secondary'}`, href: '#/eq-drill?only=memorise' },
      `Must-memorise only (${memoriseCount})`),
    ' ',
    el('a', { class: `act${memoriseOnly ? ' secondary' : ''}`, href: '#/eq-drill' }, `All (${all.length})`),
    ' ',
    el('a', { class: 'act secondary', href: '#/reference' }, 'See the formula sheet')));

  const shuffle = (arr) => {
    const a = [...arr];
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  };
  // must-memorise first, shuffled within each group
  const cards = memoriseOnly
    ? shuffle(all.filter(isMemorise))
    : [...shuffle(all.filter(isMemorise)), ...shuffle(all.filter(c => !isMemorise(c)))];

  const stage = el('div', {});
  let i = 0, timer = null, reviewed = 0;

  const jump = (n) => { i = Math.min(Math.max(0, n), cards.length); show(); };
  const nav = cardNav({ queue: cards, getIndex: () => i, jump });
  root.append(stage, nav.controls, nav.panel);

  function show() {
    if (timer) { clearInterval(timer); timer = null; }
    stage.replaceChildren();
    if (i >= cards.length) {
      stage.append(el('p', {}, `End of the deck — ${reviewed} of ${cards.length} equations rated.`));
      return;
    }
    const card = cards[i];
    let secs = 30;
    const clock = el('span', { class: 'eq-timer' }, '0:30');
    const cardEl = el('div', { class: 'card-stage' },
      el('p', { class: 'card-meta' }, `${i + 1} of ${cards.length} · ${moduleTitle(card.moduleId)}${card.meta ? ' · ' + card.meta : ''}`, clock),
      el('p', { class: 'card-prompt' }, card.prompt),
      el('p', { class: 'front' }, card.front));
    const actions = el('div', { class: 'card-actions' });
    const revealNow = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (cardEl.querySelector('.back')) return;
      cardEl.append(el('div', { class: 'back', html: card.backHtml }));
      actions.replaceChildren(
        el('button', { class: 'act secondary', onclick: () => rate('no-idea') }, 'No idea'),
        el('button', { class: 'act secondary', onclick: () => rate('partly') }, 'Partly'),
        el('button', { class: 'act secondary', onclick: () => rate('got-it') }, 'Got it'));
    };
    actions.append(el('button', { class: 'act', onclick: revealNow }, 'Show'));
    stage.append(cardEl, actions);
    timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      secs--;
      clock.textContent = `0:${String(Math.max(0, secs)).padStart(2, '0')}`;
      if (secs <= 0) revealNow();
    }, 1000);

    function rate(rating) {
      rateCard(card.cardId, rating, nextDue(rating));
      reviewed++; i++; show();
    }
  }
  show();
  cardKeys(root);
  return root;
}

// ---------- mixed-topic drill ----------

/**
 * Sampling weight: his declared tag on the question, multiplied by what he has
 * actually done on it. Red and previously-wrong questions surface most.
 */
function weightFor(itemId) {
  const eff = effectiveTag(itemId);
  const v = eff ? eff.value : null;
  const declared = v === 'red' ? 3 : v === 'amber' ? 2 : v === 'green' ? 1 : 1.5;
  return declared * questionNeedWeight(itemId);
}

function sampleQuestions(n, moduleIds = null, weighted = true) {
  const pool = [];
  for (const mod of content.modules) {
    if (moduleIds && !moduleIds.includes(mod.id)) continue;
    for (const q of mod.sections.drill.questions) pool.push({ q, moduleId: mod.id });
  }
  const take = Math.min(n, pool.length);
  if (weighted) return weightedSample(pool, take, x => weightFor(x.q.itemId));
  // even: plain shuffle, so a full pass really is every question
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  return pool.slice(0, take);
}

/** How many drill questions exist in the current selection. */
function drillPoolSize(moduleIds = null) {
  return content.modules.reduce((a, m) =>
    a + ((moduleIds && !moduleIds.includes(m.id)) ? 0 : m.sections.drill.questions.length), 0);
}

export function renderMixDrill(query = {}) {
  const mods = paramToMods(query.mods);
  const mode = query.mode || getPref('mode.drill', 'even');
  const poolSize = drillPoolSize(mods);
  // length and weighting are independent; the last length he picked is kept
  const lenChoice = query.n !== undefined ? String(query.n) : String(getPref('len.drill', 20));
  const wantsAll = lenChoice === 'all';
  const n = Math.max(1, Math.min(60, Number(lenChoice) || 20));
  const set = sampleQuestions(wantsAll ? Infinity : n, mods, mode === 'weak');
  const root = view('Mixed practice',
    `${set.length} drill question${set.length === 1 ? '' : 's'}${mods ? ' from ' + mods.map(moduleTitle).join(' · ') : ' across the modules'}. ` +
    (mode === 'weak'
      ? 'Weighted towards red tags and anything you have got wrong.'
      : 'Every question has an equal chance.'));
  const goDrill = (over = {}) => {
    const q = new URLSearchParams();
    if (query.mods) q.set('mods', query.mods);
    q.set('mode', over.mode ?? mode);
    q.set('n', over.n ?? lenChoice);
    navigate(`#/mix-drill?${q}`);
  };

  root.append(modeSwitch('Question choice', [
    { value: 'even', label: 'Even — full coverage' },
    { value: 'weak', label: 'Weighted to weak topics' },
  ], mode, (v) => { setPref('mode.drill', v); goDrill({ mode: v }); }));

  root.append(modeSwitch('How many', [
    { value: '10', label: '10' },
    { value: '20', label: '20' },
    { value: '30', label: '30' },
    { value: '40', label: '40' },
    { value: 'all', label: `All ${poolSize}` },
  ], wantsAll ? 'all' : String(n), (v) => { setPref('len.drill', v); goDrill({ n: v }); }));
  if (mods) root.append(el('p', { class: 'plain-note' },
    el('a', { href: '#/mix-drill' }, 'Draw from every module instead'), ' · ',
    el('a', { href: '#/practice' }, 'change selection')));
  const stage = el('div', {});
  let i = 0;

  const jump = (n) => { i = Math.min(Math.max(0, n), set.length); show(); };
  const nav = cardNav({
    queue: set, getIndex: () => i, jump,
    labelFor: ({ q, moduleId }) => {
      const prompt = q.promptHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return [`${moduleTitle(moduleId)} ${q.qid}`, ` — ${q.marks ? q.marks + ' marks · ' : ''}${prompt.slice(0, 70)}…`];
    },
  });
  root.append(stage, nav.controls, nav.panel);

  function show() {
    stage.replaceChildren();
    if (i >= set.length) {
      stage.append(el('p', {}, `End of the set — ${set.length} questions.`),
        el('p', {}, el('a', { class: 'act secondary', href: '#/red' }, 'Red list')));
      return;
    }
    const { q, moduleId } = set[i];
    stage.append(el('p', { class: 'card-meta' }, `${i + 1} of ${set.length} · ${moduleTitle(moduleId)} · ${q.qid}${q.marks ? ` · ${q.marks} marks` : ''}`));
    stage.append(questionBlock(q));
  }
  attachCapture(stage);
  show();
  cardKeys(root);
  return root;
}

/**
 * Shared card shortcuts: space/enter presses the primary button (Show),
 * 1 / 2 / 3 rate the revealed card (No idea / Partly / Got it). Works for the
 * flashcards and both drills because they all use the same button shapes.
 */
export function cardKeys(root) {
  root.append(el('p', { class: 'plain-note keys-hint' }, 'Keyboard: space — show · 1 no idea · 2 partly · 3 got it'));
  attachKeys(root, (e) => {
    const byText = (t) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === t && !b.disabled);
    if (e.key === ' ' || e.key === 'Enter') {
      const show = byText('Show');
      if (show) { e.preventDefault(); show.click(); }
      return;
    }
    const rating = { 1: 'No idea', 2: 'Partly', 3: 'Got it' }[e.key];
    if (rating) {
      const b = byText(rating);
      if (b) { e.preventDefault(); b.click(); }
    }
  });
}
