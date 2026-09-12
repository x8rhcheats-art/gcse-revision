// views/mock.js — timed mock mode and untimed revision mode, for the two
// in-app mocks and the three past papers. Papers are worked ON PAPER (they
// require graph plotting); the app runs the clock, keeps the mark scheme
// locked until submission or expiry, then takes the marks and error codes.
// Revision mode drops the timer: reveal each answer with a self-rating, tag
// shaky questions in the margin, and follow links to the relevant content.

import { content, index, moduleTitle, registry } from '../content.js';
import { el, view, shortDate, navigate, notFound } from '../ui.js';
import { getState, startMock, abandonMock, saveMockAttempt, latestMockAttempt } from '../store.js';
import { localDate } from '../model.js';
import { attachRail } from '../rail.js';
import { attachCapture } from '../capture.js';

const CODES = [
  ['knowledge', 'K'], ['wording', 'W'], ['maths', 'M'], ['unit-conversion', 'U'], ['presentation', 'P'],
];

function sessionFor(mockId) {
  const s = getState().activeMock;
  return s && s.mockId === mockId ? s : null;
}

function remainingSeconds(session) {
  const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
  return Math.round(session.minutes * 60 - elapsed);
}

// ---------- timer ----------

function timerView(mock, session) {
  const root = el('div', { class: 'view timer-view' });
  root.append(el('p', { class: 'timer-sub' }, `${mock.title} · ${mock.computedMarks} marks · started ${shortDate(session.startedAt)}`));
  const clock = el('div', { class: 'timer-clock' }, '—');
  root.append(clock);
  const sub = el('p', { class: 'timer-sub' }, 'Work on paper. The mark scheme unlocks when you finish.');
  root.append(sub);
  root.append(el('div', { style: 'margin-top:30px' },
    el('button', { class: 'act', onclick: () => { navigate(`#/mock/${mock.id}?mode=enter`); } }, 'Finish — enter marks'),
    ' ',
    el('button', {
      class: 'act secondary', onclick: () => {
        if (confirm('Abandon this sitting? The timer will be discarded.')) { abandonMock(); navigate(`#/mock/${mock.id}`); }
      },
    }, 'Abandon')));

  const update = () => {
    const s = remainingSeconds(session);
    if (s <= 0) {
      clock.textContent = '0:00';
      clock.classList.add('low');
      sub.textContent = 'Time is up. Put the pen down and enter the marks.';
      clearInterval(timer);
      return;
    }
    const m = Math.floor(s / 60), sec = s % 60;
    clock.textContent = `${m}:${String(sec).padStart(2, '0')}`;
    clock.classList.toggle('low', s <= 300);
  };
  // the view is built detached; only the interval checks for disconnection
  const timer = setInterval(() => {
    if (!root.isConnected) { clearInterval(timer); return; }
    update();
  }, 500);
  update();
  return root;
}

// ---------- mark entry ----------

function entryView(mock) {
  const session = sessionFor(mock.id);
  const root = view(`${mock.title} — enter marks`,
    'Score each question, then put every lost mark into one of the five columns. K knowledge · W wording · M maths · U unit conversion · P presentation.');
  root.append(el('p', {},
    schemeHref(mock) ? el('a', { class: 'act', href: schemeHref(mock), target: '_blank' }, 'Open the mark scheme') : null,
    ' ', el('span', { class: 'plain-note' }, 'Mark the paper against it, then enter the scores below.')));

  const table = el('table', { class: 'entry' });
  table.append(el('tr', {},
    el('th', {}, 'Q'), el('th', {}, 'Topic'), el('th', {}, 'Score'), el('th', {}, 'Max'),
    ...CODES.map(([, letter]) => el('th', { title: 'marks lost' }, letter))));

  const scoreInputs = new Map(), codeInputs = new Map();
  for (const q of mock.questions) {
    const score = el('input', { type: 'number', class: 'score', min: 0, max: q.marks, inputmode: 'numeric' });
    scoreInputs.set(q.number, score);
    const codes = CODES.map(([code]) => {
      const inp = el('input', { type: 'number', class: 'code-n', min: 0, max: q.marks, inputmode: 'numeric' });
      codeInputs.set(`${q.number}/${code}`, inp);
      return el('td', {}, inp);
    });
    table.append(el('tr', {},
      el('td', { class: 'num' }, String(q.number)),
      el('td', {}, q.topic),
      el('td', {}, score),
      el('td', { class: 'num' }, `/${q.marks}`),
      ...codes));
  }
  root.append(table);

  const minutesDefault = session ? Math.min(mock.minutes, Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000))) : '';
  const minutes = el('input', { type: 'number', class: 'score', min: 1, max: 600, value: minutesDefault });
  const date = el('input', { type: 'date', value: localDate() });
  root.append(el('p', {}, 'Minutes taken: ', minutes, '  Date sat: ', date));

  const warn = el('p', { class: 'entry-warn' });
  root.append(warn);

  root.append(el('p', {},
    el('button', {
      class: 'act', onclick: () => {
        const questionScores = [], errorTags = [];
        let total = 0, bad = null;
        for (const q of mock.questions) {
          const raw = scoreInputs.get(q.number).value;
          if (raw === '') { bad = `Question ${q.number} has no score.`; break; }
          const score = Number(raw);
          if (Number.isNaN(score) || score < 0 || score > q.marks) { bad = `Question ${q.number}: score must be between 0 and ${q.marks}.`; break; }
          total += score;
          questionScores.push({ number: q.number, score, marks: q.marks });
          let coded = 0;
          for (const [code] of CODES) {
            const n = Number(codeInputs.get(`${q.number}/${code}`).value || 0);
            if (n > 0) { errorTags.push({ questionNumber: q.number, marksLost: n, code }); coded += n; }
          }
          if (coded > q.marks - score) { bad = `Question ${q.number}: ${coded} marks coded as lost, but only ${q.marks - score} were lost.`; break; }
        }
        if (bad) { warn.textContent = bad; return; }
        saveMockAttempt({
          mockId: mock.id, at: new Date(date.value + 'T12:00:00').toISOString(),
          totalScore: total, totalMarks: mock.computedMarks,
          minutesTaken: minutes.value ? Number(minutes.value) : null,
          questionScores, errorTags,
        });
        navigate(`#/mock/${mock.id}`);
      },
    }, 'Save'),
    ' ',
    el('a', { class: 'act secondary', href: `#/mock/${mock.id}` }, 'Cancel')));
  return root;
}

function isPaper(exam) { return exam.kind === 'past-paper'; }
function paperHref(exam) { return isPaper(exam) ? exam.paperFile : `mocks/${registry.activeId}/${exam.id}.html`; }
function schemeHref(exam) { return isPaper(exam) ? exam.markSchemeFile : `mocks/${registry.activeId}/${exam.id}-markscheme.html`; }

// ---------- revision mode: untimed, answer-by-answer, feeds both signals ----------

function relatedLinks(q) {
  const links = [];
  for (const mid of q.moduleIds || []) {
    links.push(
      el('a', { href: `app.html#/module/${mid}`, target: '_blank' }, moduleTitle(mid)),
      ' · ',
      el('a', { href: `app.html#/module/${mid}?item=${encodeURIComponent(mid + '/section/sheet')}`, target: '_blank' }, 'cheat sheet'),
      '   ');
  }
  links.push(el('a', { href: 'app.html#/cards', target: '_blank' }, 'flashcards'));
  return el('p', { class: 'plain-note' }, 'Revise this: ', ...links);
}

function revisionView(exam) {
  const root = view(`${exam.title} — revision mode`,
    'No timer. Try each question properly before opening the answer, rate yourself honestly, and tag anything shaky with the dot in the margin — tagged questions join the red list.');

  root.append(el('p', {},
    paperHref(exam) ? el('a', { class: 'act', href: paperHref(exam), target: '_blank' }, 'Open the paper') : null,
    ' ',
    isPaper(exam) && schemeHref(exam) ? el('a', { class: 'act secondary', href: schemeHref(exam), target: '_blank' }, 'Open the mark scheme') : null,
    ' ',
    el('a', { class: 'act secondary', href: `#/mock/${exam.id}` }, 'Back to timed mode')));

  for (const q of exam.questions) {
    const inner = el('div', { class: 'inner' });
    if (q.markSchemeHtml) inner.append(el('div', { html: q.markSchemeHtml }));
    if (isPaper(exam)) inner.append(el('p', { class: 'plain-note' },
      q.markSchemeHtml ? 'Transcribed from the school mark scheme — ' : 'The full answer is in the ',
      schemeHref(exam) ? el('a', { href: schemeHref(exam), target: '_blank' }, q.markSchemeHtml ? 'original with diagrams' : 'mark scheme') : null,
      q.markSchemeHtml ? '.' : `, question ${q.number}.`));
    inner.append(relatedLinks(q));

    root.append(el('div', { class: 'q', 'data-item-id': q.itemId, 'data-question-id': q.itemId },
      el('div', { class: 'qid' }, `Q${q.number}`),
      el('div', { class: 'qbody' },
        el('p', {}, el('strong', {}, q.topic), ' ', el('span', { class: 'marks' }, `(${q.marks})`)),
        isPaper(exam)
          ? el('p', { class: 'plain-note' }, `Work from the paper — question ${q.number}.`)
          : el('div', { html: q.promptHtml }),
        el('details', { class: 'ans' },
          el('summary', {}, 'Show answer'),
          inner))));
  }

  attachRail(root);
  attachCapture(root);
  return root;
}

// ---------- scheme (locked until an attempt exists or the clock ran out) ----------

function schemeUnlocked(mock) {
  if (latestMockAttempt(mock.id)) return true;
  const session = sessionFor(mock.id);
  return session ? remainingSeconds(session) <= 0 : false;
}

function schemeBlocks(mock, attempt) {
  const wrap = el('div', {});
  for (const q of mock.questions) {
    const qs = attempt ? attempt.questionScores.find(x => x.number === q.number) : null;
    wrap.append(el('section', {},
      el('h2', {}, el('span', { class: 'num' }, `Q${q.number}`), q.topic, ' ',
        el('span', { class: 'marks' }, qs ? `${qs.score}/${q.marks}` : `(${q.marks})`),
        ' ', ...q.moduleIds.map(mid => el('a', { href: `#/module/${mid}`, style: 'font-size:13px;margin-left:8px' }, index.moduleById.get(mid)?.title || mid))),
      el('div', { html: q.markSchemeHtml || '<p>—</p>' })));
  }
  return wrap;
}

// ---------- main render ----------

export function renderMock(params, query) {
  const mock = index.mockById.get(params.id);
  if (!mock) return notFound('paper');

  const session = sessionFor(mock.id);
  if (query.mode === 'enter') return entryView(mock);
  if (query.mode === 'revise') return revisionView(mock);
  if (session && remainingSeconds(session) > 0) return timerView(mock, session);

  const attempt = latestMockAttempt(mock.id);
  const root = view(mock.title,
    `${mock.computedMarks} marks · ${mock.minutes} minutes · sit on paper, under exam conditions.`);
  root.append(el('p', {},
    'There is nothing to type — answers go on paper, the same as the real exam. ',
    'Two ways to use it: sit it timed and enter the marks after, or work through it untimed in revision mode, answer by answer.'));
  if (isPaper(mock)) {
    root.append(el('p', { class: 'plain-note' }, 'A genuine school past paper. The plan reserves these for timed sittings in the final fortnight — revision mode spends it more cheaply than a full sitting does.'));
  }
  if (mock.computedMarks !== mock.totalMarks) {
    root.append(el('p', { class: 'plain-note' }, `Note: the paper header says ${mock.totalMarks} marks; the questions total ${mock.computedMarks}. Scores here are out of ${mock.computedMarks}.`));
  }

  if (session && remainingSeconds(session) <= 0) {
    root.append(el('p', {}, 'Time expired on the last sitting. Enter the marks below.'));
  }

  root.append(el('p', {},
    paperHref(mock) ? el('a', { class: 'act', href: paperHref(mock), target: '_blank' }, 'Open the paper') : null,
    ' ',
    session
      ? el('a', { class: 'act', href: `#/mock/${mock.id}?mode=enter` }, 'Enter marks')
      : el('button', {
          class: 'act', onclick: () => { startMock(mock.id, mock.minutes); navigate(`#/mock/${mock.id}`); },
        }, 'Start the timer'),
    ' ',
    el('a', { class: 'act secondary', href: `#/mock/${mock.id}?mode=revise` }, 'Revision mode — untimed'),
    ' ',
    !session && !attempt ? el('a', { class: 'act secondary', href: `#/mock/${mock.id}?mode=enter` }, 'Sat it already — enter marks') : null));

  if (attempt) {
    // pace: the department's own rule is one minute per mark
    let pace = null;
    if (attempt.minutesTaken) {
      const perMark = attempt.minutesTaken / attempt.totalMarks;
      const over = attempt.minutesTaken - mock.minutes;
      pace = `${perMark.toFixed(2)} minutes per mark against a budget of ${(mock.minutes / mock.totalMarks).toFixed(2)}. ` +
        (over > 2 ? `That is ${Math.round(over)} minutes over the time allowed — pace is costing marks at the back of the paper.`
          : over < -10 ? `Finished ${Math.abs(Math.round(over))} minutes early — there was time to check the working.`
          : 'Comfortably inside the time allowed.');
    }
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Result'), 'Latest sitting'),
      el('p', {}, `${attempt.totalScore}/${attempt.totalMarks}, sat ${shortDate(attempt.at)}` +
        (attempt.minutesTaken ? `, ${attempt.minutesTaken} minutes` : '') + '.'),
      pace ? el('p', { class: 'plain-note' }, pace) : null,
      el('p', {}, el('a', { class: 'act secondary', href: `#/mock/${mock.id}?mode=enter` }, 'Enter another sitting')));
  }

  if (mock.instructionsHtml) {
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Before you start'), 'Instructions'),
      el('div', { html: mock.instructionsHtml }));
  }

  if (schemeUnlocked(mock)) {
    root.append(el('h2', {}, el('span', { class: 'num' }, 'Mark scheme'), 'Question by question'));
    if (isPaper(mock)) {
      if (schemeHref(mock)) root.append(el('p', {}, el('a', { class: 'act', href: schemeHref(mock), target: '_blank' }, 'Original mark scheme (with diagrams)')));
    }
    root.append(schemeBlocks(mock, attempt));
  } else {
    root.append(el('p', { class: 'plain-note' }, 'The mark scheme unlocks here after a timed sitting or mark entry. Revision mode shows answers as you go.'));
  }
  return root;
}
