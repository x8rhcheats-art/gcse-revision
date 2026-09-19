// views/mcq.js — multiple-choice quizzes: one per module, plus a randomised
// whole-curriculum session. Every answer is recorded as objective demonstrated
// evidence (correct = got-it, wrong = no-idea, 1 mark each) and feeds the
// coach view like any other attempt. Options are shuffled on every showing.

import { content, modulesByWeight, moduleTitle, paramToMods, modsToParam, activeSubject, inGroup } from '../content.js';
import { el, view, modeSwitch, navigate, notFound, attachKeys } from '../ui.js';
import { recordAttempt, getPref, setPref } from '../store.js';
import { wrongAttempts } from './review.js';
import { moduleNeed, redItemsByModule, questionNeedWeight, weightedSample, modulesByNeed } from '../model.js';

const WHOLE_CURRICULUM_SIZE = 20;

/**
 * Sampling weight for one MCQ: how much its module needs work, multiplied by
 * his own history on that exact question. This is the feedback loop — a wrong
 * answer or a blind-spot module pulls questions towards him.
 */
function mcqWeight({ q, modId }, needByModule) {
  return (needByModule.get(modId) || 2) * questionNeedWeight(q.itemId);
}

function shuffled(arr) {
  const a = [...arr];
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

export function renderMcqHome() {
  const root = view('Multiple choice', 'Instant marking. Every answer counts as evidence in the coach view.');

  const bankSize = Object.values(content.mcq).reduce((a, qs) => a + qs.length, 0);

  root.append(el('a', { class: 'rowlink', href: '#/mcq/all?mode=even&n=all' },
    el('span', {},
      el('span', { class: 't' }, 'Every question'),
      el('br'),
      el('span', { class: 'd' }, 'A complete pass through the whole bank, in random order — nothing weighted, nothing skipped')),
    el('span', { class: 'r' }, `all ${bankSize}`)));

  root.append(el('a', { class: 'rowlink', href: `#/mcq/all?mode=even&n=${WHOLE_CURRICULUM_SIZE}` },
    el('span', {},
      el('span', { class: 't' }, 'Quick mixed set'),
      el('br'),
      el('span', { class: 'd' }, 'An even sample from across all eight modules')),
    el('span', { class: 'r' }, `${WHOLE_CURRICULUM_SIZE} questions`)));

  root.append(el('a', { class: 'rowlink', href: `#/mcq/all?mode=weak&n=${WHOLE_CURRICULUM_SIZE}` },
    el('span', {},
      el('span', { class: 't' }, 'Weighted to your weakest'),
      el('br'),
      el('span', { class: 'd' }, 'Same bank, but topics you are struggling with come up more often')),
    el('span', { class: 'r' }, `${WHOLE_CURRICULUM_SIZE} questions`)));

  const weakest = modulesByNeed().slice(0, 3);
  root.append(el('a', { class: 'rowlink', href: `#/mcq/custom?mods=${modsToParam(weakest.map(m => m.moduleId))}&n=20&mode=weak` },
    el('span', {},
      el('span', { class: 't' }, 'Weakest three modules'),
      el('br'),
      el('span', { class: 'd' }, weakest.map(m => m.title).join(' · '))),
    el('span', { class: 'r' }, '20 questions')));

  const wrongCount = wrongAttempts().filter(r => r.entry.kind === 'mcq').length;
  if (wrongCount) {
    root.append(el('a', { class: 'rowlink', href: '#/mcq/wrong' },
      el('span', {},
        el('span', { class: 't' }, 'Just the ones you got wrong'),
        el('br'),
        el('span', { class: 'd' }, 'Retry only the questions you have missed')),
      el('span', { class: 'r' }, `${wrongCount} waiting`)));
  }

  root.append(el('h2', {}, el('span', { class: 'num' }, 'By module'), 'One module at a time'));
  // subjects split into years list each year under its own heading
  const groups = activeSubject().moduleGroups || [{ title: null, from: -Infinity, to: Infinity }];
  for (const g of groups) {
    const rows = modulesByWeight().filter(m => inGroup(g, m) && (content.mcq[m.id] || []).length);
    if (!rows.length) continue;
    if (g.title) root.append(el('h3', {}, g.title));
    for (const m of rows) {
      root.append(el('a', { class: 'rowlink', href: `#/mcq/${m.id}` },
        el('span', { class: 't' }, m.title),
        el('span', { class: 'r' }, `${content.mcq[m.id].length} questions`)));
    }
  }
  return root;
}

export function renderMcqQuiz(params, query = {}) {
  const isAll = params.id === 'all';
  const isWrong = params.id === 'wrong';
  const isCustom = params.id === 'custom';
  const mods = paramToMods(query.mods);
  const everything = () => Object.entries(content.mcq).flatMap(([modId, qs]) => qs.map(q => ({ q, modId })));

  let pool, canWeight = false;
  if (isWrong) {
    const wrongIds = new Set(wrongAttempts().filter(r => r.entry.kind === 'mcq').map(r => r.qid));
    pool = everything().filter(x => wrongIds.has(x.q.itemId));
    if (!pool.length) {
      return view('Retry wrong answers', 'Nothing to retry — you have not got any multiple-choice questions wrong yet.');
    }
  } else if (isCustom) {
    pool = everything().filter(x => !mods || mods.includes(x.modId));
    canWeight = true;
  } else if (isAll) {
    pool = everything();
    canWeight = true;
  } else {
    pool = (content.mcq[params.id] || []).map(q => ({ q, modId: params.id }));
    canWeight = true;
  }
  if (!pool.length) return notFound('quiz');

  // His choice, remembered. The URL can override it for one session.
  const mode = query.mode || getPref('mode.mcq', 'even');
  const weighted = canWeight && mode === 'weak';
  // Length is independent of weighting. A single module or the wrong-answers
  // queue defaults to its whole set; otherwise use the length he last chose.
  const lenChoice = query.n !== undefined ? String(query.n)
    : (isAll ? String(getPref('len.mcq', WHOLE_CURRICULUM_SIZE)) : 'all');
  const wantsAll = lenChoice === 'all';
  const size = Math.max(1, Math.min(120, Number(lenChoice) || WHOLE_CURRICULUM_SIZE));
  const take = wantsAll ? pool.length : Math.min(size, pool.length);

  let set;
  if (weighted) {
    const redCounts = redItemsByModule();
    const needByModule = new Map(content.modules.map(m => [m.id, moduleNeed(m.id, redCounts).score]));
    set = weightedSample(pool, take, x => mcqWeight(x, needByModule));
  } else {
    set = shuffled(pool).slice(0, take);
  }

  const modNames = mods ? mods.map(moduleTitle).join(' · ') : null;
  const title = isWrong ? `Multiple choice — ${set.length} you got wrong`
    : isCustom ? `Multiple choice — ${set.length} questions`
    : isAll ? `Multiple choice — ${set.length} questions`
    : `Multiple choice — ${moduleTitle(params.id)}`;
  const root = view(title, weighted
    ? `Weighted towards what you are weakest on${modNames ? '. ' + modNames : ''}. Marking is immediate.`
    : `Every question in the set gets an equal chance${modNames ? '. ' + modNames : ''}. Marking is immediate.`);

  // The switches are always visible, so full coverage and a longer set are
  // never more than one tap away.
  if (canWeight && !isWrong) {
    const goQuiz = (over = {}) => {
      const q = new URLSearchParams();
      if (query.mods) q.set('mods', query.mods);
      q.set('mode', over.mode ?? mode);
      q.set('n', over.n ?? (wantsAll ? 'all' : String(take)));
      navigate(`#/mcq/${params.id}?${q}`);
    };

    root.append(modeSwitch('Question choice', [
      { value: 'even', label: 'Even — full coverage' },
      { value: 'weak', label: 'Weighted to weak topics' },
    ], mode, (v) => { setPref('mode.mcq', v); goQuiz({ mode: v }); }));

    root.append(modeSwitch('How many', [
      { value: '10', label: '10' },
      { value: '20', label: '20' },
      { value: '40', label: '40' },
      { value: 'all', label: `All ${pool.length}` },
    ], wantsAll ? 'all' : String(take), (v) => { setPref('len.mcq', v); goQuiz({ n: v }); }));
  }
  const stage = el('div', {});
  root.append(stage);

  let i = 0, correct = 0;
  const misses = [];

  function show() {
    stage.replaceChildren();
    if (i >= set.length) {
      stage.append(el('p', {}, `${correct} of ${set.length} correct.`));
      if (misses.length) {
        stage.append(el('p', { class: 'plain-note' }, 'Wrong: ' +
          misses.map(m => `${moduleTitle(m.modId)} ${m.q.id}`).join(' · ')));
      }
      stage.append(el('p', {},
        // same hash fires no navigation event, so force a fresh draw
        el('a', { class: 'act', href: location.hash,
          onclick: () => setTimeout(() => location.reload(), 0) }, 'Run it again'),
        ' ',
        el('a', { class: 'act secondary', href: '#/mcq' }, 'All quizzes'),
        ' ',
        el('a', { class: 'act secondary', href: '#/practice' }, 'Build another session')));
      return;
    }

    const { q, modId } = set[i];
    stage.append(el('p', { class: 'card-meta' },
      `${i + 1} of ${set.length}${isAll ? ' · ' + moduleTitle(modId) : ''} · ${q.id}`));
    stage.append(el('p', { class: 'mcq-q' }, q.q));

    // shuffle the options each showing so positions can't be memorised
    const order = shuffled([0, 1, 2, 3]);
    const buttons = [];
    const optWrap = el('div', { class: 'mcq-options' });
    order.forEach((optIdx, pos) => {
      const btn = el('button', { class: 'mcq-option', onclick: () => choose(optIdx, btn) },
        el('span', { class: 'mcq-letter' }, 'ABCD'[pos]), q.options[optIdx]);
      buttons.push({ btn, optIdx });
      optWrap.append(btn);
    });
    stage.append(optWrap);

    function choose(optIdx, btn) {
      const isRight = optIdx === q.answer;
      recordAttempt(q.itemId, isRight ? 'got-it' : 'no-idea');
      if (isRight) correct++; else misses.push({ q, modId });
      for (const { btn: b, optIdx: oi } of buttons) {
        b.disabled = true;
        if (oi === q.answer) b.classList.add('right');
        else if (b === btn) b.classList.add('wrong');
      }
      stage.append(
        el('div', { class: 'mcq-explain' },
          el('p', {}, el('strong', {}, isRight ? 'Correct. ' : 'No — '), q.explain)),
        el('p', { style: 'margin-top:14px' },
          el('button', { class: 'act', onclick: () => { i++; show(); } },
            i + 1 === set.length ? 'Finish' : 'Next question')));
      stage.querySelector('.act').focus();
    }
  }
  show();
  root.append(el('p', { class: 'plain-note keys-hint' }, 'Keyboard: 1–4 — answer · enter — next question'));
  // keyboard: 1–4 answer the question; Enter already advances (Next is focused)
  attachKeys(root, (e) => {
    const n = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    if (n === undefined) return;
    const opts = [...root.querySelectorAll('.mcq-option')];
    if (opts[n] && !opts[n].disabled) { e.preventDefault(); opts[n].click(); }
  });
  return root;
}
