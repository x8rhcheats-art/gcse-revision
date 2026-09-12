# Scoping Memo — Physics Revision App

**For:** Claude Code
**Deliverable:** a local-only web application for one student revising Edexcel IGCSE Physics 4PH1
**Hard deadline:** exam is 3 September 2026. App must be usable by 15 August.
**Requested first:** a planback before any code is written.

---

## 1. Context

John, 15, resitting his Year 10 end-of-year Physics exam on 3 September 2026 after an underperformance in June. He has been taught the entire syllabus — this is consolidation and exam technique, not first teaching.

The revision content already exists as eight HTML modules, two mock papers and two mark schemes, in `/site`. **That content is the source of truth and must not be rewritten.** The app's job is to make it navigable, trackable and practisable — not to replace it.

There is one user. No accounts, no auth, no multi-tenancy, no server. It runs on a MacBook, opened locally.

---

## 2. What exists now

```
site/
├── index.html                          # landing page, module grid, schedule
├── assets/
│   └── style.css                       # complete design system
├── modules/
│   ├── 01-forces-and-motion.html
│   ├── 02-solids-liquids-gases.html
│   ├── 03-electrical-circuits.html
│   ├── 04-waves-and-em-spectrum.html
│   ├── 05-static-electricity.html
│   ├── 06-radioactivity.html
│   ├── 07-practical-and-data-skills.html
│   └── 08-energy.html
└── mocks/
    ├── mock-1.html
    ├── mock-1-markscheme.html
    ├── mock-2.html
    └── mock-2-markscheme.html
```

Each module follows an identical four-section structure: **What comes up** (exam intelligence), **Cheat sheet** (equations, definitions, vocabulary traps), **Understanding it** (4–6 conceptual questions with reasoned answers), **Exam drill** (6–8 exam-style questions with mark-by-mark schemes).

Answers sit inside `<details class="ans">` elements. Mark points are `<span class="mp">1</span>`. Examiner warnings are `<div class="trap">`.

---

## 3. Non-negotiable constraints

| Constraint | Why |
|---|---|
| **Fully offline** | No internet assumed. No CDNs, no Google Fonts, no external API calls. |
| **No build step for the end user** | Must run by opening a file or a single `npm start`. Nobody is debugging a toolchain at 11pm on 2 September. |
| **Data persists locally** | Progress must survive a browser restart. localStorage or a local JSON file. |
| **Exportable progress** | Parent needs to see where he's at. One-click export to a readable file. |
| **Printable** | Some work will be done on paper. Print styles already exist in `style.css` — preserve them. |
| **Preserve the existing design system** | `style.css` is the visual identity. Extend it; do not replace it with a component library. |

---

## 4. Functionality spec

Prioritised. Build P0 first and ship it before starting P1.

**The confidence model in Section 5 is the spine of this app.** Read it before building anything. Two functions above all others justify the build: capturing what John knows, and showing the parent where to teach. Everything else is navigation.

### P0 — must exist by 15 August

**Module reader.** Render the eight modules with persistent left navigation, section jump links, and a visible position indicator. Essentially what exists now, plus navigation that doesn't require going back to the index.

**Declared confidence tagging — everywhere.** John must be able to traffic-light *any* taggable item at any time, without attempting a question first: a whole module, a section, an equation, a definition, a vocabulary trap, an individual question. Red / amber / green, matching the system his school's own revision guidance recommends, so the vocabulary is already familiar.

- One tap. Always visible on hover or as a persistent margin control. Never behind a menu.
- Re-taggable at any point. Keep the history — a definition that went red → amber → green is a different situation from one that has been green since day one.
- Bulk tagging at section level, so he can mark a whole cheat sheet green in one action rather than tapping nineteen definitions.

**Demonstrated performance capture.** When John opens an answer, ask before revealing: **Got it / Partly / No idea**. One tap, skippable so it never becomes friction. This is behavioural evidence and is stored separately from declared confidence — see Section 5 for why the distinction matters.

**Content surfacing driven by tags.** The tags must actually *do* something or he will stop using them within a day.

- Filter any module to red items only
- A "red list" view across all modules — everything he has flagged, in one place, as the study queue
- Home screen entry point: "Work on your red topics" with a live count

**Coach dashboard.** Promoted from P2. This is a primary deliverable, not a nice-to-have. See Section 5.3 for what it must show.

**Timed mock mode.** Full-screen, countdown timer, mark scheme locked until submitted or time expires. On submission, a mark-entry form per question. Marks feed the confidence model as demonstrated performance.

**Error-code tagging on mocks.** Promoted from P1, because it is half the diagnostic signal. When entering mock marks, tag each lost mark with one of: `knowledge` · `wording` · `maths` · `unit-conversion` · `presentation`. Same five codes as the paper diagnostic, so the picture runs unbroken from 9 August to 30 August.

### P1 — by 20 August if P0 is solid

**Spaced repetition on cheat sheets.** Definitions and equations become flashcards, with the queue weighted by the confidence model — red items first and most often. Anything rated "No idea" resurfaces the next day; "Partly" after three days; "Got it" after a week. Simple interval bumping — do not build a full SM-2 implementation.

**Equation drill.** A rapid-fire mode: name the equation, or state what each symbol means. Thirty seconds per card. Pure recall, worth several marks per paper.

**Confidence timeline.** A simple view of how each topic's state has moved over the 27 days. Answers "is this actually improving, or has he been stuck on radioactivity for two weeks?"

**Search.** Across all module content. Plain substring matching is sufficient.

### P2 — only if time allows

**Countdown to 3 September** on the home screen with the schedule from `index.html` rendered as a checklist.

**Randomised drill sets.** Pull N questions across selected modules, weighted towards red topics, for a mixed-topic practice session.

**Export.** Coach dashboard to a single printable page or JSON file.

### Explicitly out of scope

No LLM calls. No question generation. No accounts. No cloud sync. No mobile app. No gamification — no streaks, badges, points, or confetti. He is fifteen, resitting an exam he failed, and being congratulated by software for clicking a button will read as condescension.

---

## 5. The confidence model

Two independent signals feed one picture. Keeping them separate is the point — collapsing them into a single score destroys the most useful thing the app can tell us.

### 5.1 The two signals

**Declared confidence — what John says.** Traffic-light tags he applies himself, at any time, to any item. Fast, subjective, available before he has attempted anything. This is how he tells the app what to show him.

**Demonstrated performance — what John does.** Self-ratings on answer reveal, mock question scores, error codes, repeat attempts on the same question, time spent. Slower to accumulate, objective, and available only after he has actually tried something.

Store both. Never overwrite one with the other. A green tag on a topic he has never attempted is a *claim*; a green tag on a topic where he scored 11/12 in Mock 1 is a *fact*.

### 5.2 Reconciling them — the highest-value output

For each topic, derive a state from the pair. The interesting cases are the disagreements.

| Declared | Demonstrated | State | What it means for teaching |
|---|---|---|---|
| Green | Strong | `secure` | Leave it alone. Light flashcard review only. |
| Red | Weak | `known gap` | He knows he can't do it. Straightforward — teach it. |
| **Green** | **Weak** | **`blind spot`** | **Highest priority.** He thinks he's fine and isn't. He will not revise this on his own. This is invisible without the app and is the main reason to build it. |
| Red | Strong | `confidence gap` | He can do it but doesn't believe he can. Costs marks through hesitation and time. Fix with reassurance and a couple of successful reps, not reteaching. |
| Green | Untested | `unverified` | Push a drill question to convert the claim into evidence. |
| Untagged | Untested | `unknown` | Neither of you knows. Get it attempted. |

Surface `blind spot` items at the top of the coach dashboard, always, in a visually distinct block. If the app does nothing else, it should do this.

### 5.3 Coach dashboard — required contents

A single read-only page. Plain, dense, scannable in thirty seconds.

1. **Blind spots** — topics rated green but performing weak. Named, with the evidence: "Moments — rated confident, scored 2/8 in Mock 1."
2. **Known gaps ranked by exam weight** — so time goes to the topics worth the most marks, not just the ones he dislikes most. Exam weight is already in `modules.json`.
3. **Error-code distribution** — across diagnostic and both mocks. If 14 marks were lost to unit conversion, that's an afternoon's fix, not a teaching problem.
4. **Confidence movement** — what has gone red → green in the last seven days, and what hasn't moved at all.
5. **Coverage** — which modules have barely been opened. Distinguishes "struggling with it" from "hasn't looked at it".
6. **Mock trend** — Mock 1 vs Mock 2, per question and total.

No praise, no encouragement, no colour-coded smiley faces. Statements of fact.

### 5.4 A note on honest self-rating

The whole model collapses if John games the tags. Two design consequences:

- **Never gate anything on a rating.** No "you must rate this to continue". Rating must always feel free.
- **Never show the tags as a score.** No "you're 62% green" progress bar. The moment a tag reads as a grade he will start tagging green to make the number go up, and the data becomes worthless.

Tags are a tool for finding what to work on. Present them that way and only that way.

---

## 6. Data schema

Content is authored as JSON, extracted once from the existing HTML. The HTML remains the human-readable fallback.

```jsonc
// content/modules.json
{
  "modules": [
    {
      "id": "01-forces-and-motion",
      "number": 1,
      "title": "Forces and Motion",
      "examWeight": 0.16,                  // share of marks, for ordering
      "specPoints": "1.1 – 1.33P",
      "estimatedSessions": 3,
      "summary": "…",
      "sections": {
        "intel": { "html": "…", "pastPaperRefs": [
          { "paper": "2024", "question": "Q7", "marks": 10, "topic": "Springs, moments, elastic limit" }
        ]},
        "cheatSheet": {
          "html": "…",
          "equations": [
            { "id": "eq-moment", "name": "Moment",
              "formula": "moment = force × perpendicular distance from the pivot",
              "mustMemorise": true, "onFormulaSheet": false }
          ],
          "definitions": [
            { "id": "def-hookes", "term": "Hooke's law",
              "acceptedWording": "Extension is directly proportional to the force applied",
              "commonError": "omitting 'directly'" }
          ],
          "traps": [
            { "id": "trap-gravity", "wrong": "gravity", "right": "weight, or gravitational force",
              "source": "2025 examiner report" }
          ]
        },
        "understanding": [
          { "id": "U1", "prompt": "…", "hint": "…", "answerHtml": "…",
            "misconception": "Newton's third law pairs act on the same object" }
        ],
        "drill": [
          { "id": "D1", "prompt": "…", "marks": 4,
            "markScheme": [
              { "point": "moment = force × perpendicular distance", "marks": 1 },
              { "point": "converts 45 cm to 0.45 m", "marks": 1 }
            ],
            "answerNote": "…",
            "skills": ["formula-recall", "unit-conversion"]   // for error analysis
          }
        ]
      }
    }
  ]
}
```

```jsonc
// content/mocks.json
{
  "mocks": [
    {
      "id": "mock-1",
      "title": "Mock Exam 1",
      "totalMarks": 90,
      "minutes": 90,
      "targetDate": "2026-08-22",
      "questions": [
        { "number": 1, "topic": "Electromagnetic spectrum", "marks": 6,
          "moduleIds": ["04-waves-and-em-spectrum"],
          "parts": [ { "ref": "a)(i)", "prompt": "…", "marks": 1,
                       "markScheme": [ { "point": "Microwaves", "marks": 1 } ] } ] }
      ]
    }
  ]
}
```

Every taggable item needs a stable `itemId`. Use `moduleId/type/localId` — e.g. `01-forces-and-motion/eq/eq-moment`, `01-forces-and-motion/def/def-hookes`, `01-forces-and-motion/drill/D1`, `01-forces-and-motion/section/cheatSheet`, or `01-forces-and-motion` for the whole module. The extraction script must emit these into `modules.json` so tags survive any content edit.

```jsonc
// Written to localStorage under key "physics-progress-v1"
{
  "version": 1,
  "lastOpened": "2026-08-14T19:22:10Z",

  // SIGNAL 1 — declared confidence. John's own tags.
  "confidence": [
    { "itemId": "01-forces-and-motion/eq/eq-moment",
      "value": "red",                      // "red" | "amber" | "green"
      "at": "2026-08-12T10:04:00Z",
      "history": [
        { "value": "red",   "at": "2026-08-11T18:30:00Z" },
        { "value": "amber", "at": "2026-08-12T10:04:00Z" }
      ]
    }
  ],

  // SIGNAL 2 — demonstrated performance. What actually happened.
  "attempts": [
    { "questionId": "01-forces-and-motion/drill/D1",
      "at": "2026-08-14T19:20:00Z",
      "selfRating": "partly",              // "got-it" | "partly" | "no-idea" | null
      "secondsSpent": 240,
      "attemptNumber": 2 }
  ],
  "mockAttempts": [
    { "mockId": "mock-1", "at": "2026-08-22T09:00:00Z",
      "totalScore": 61, "totalMarks": 90, "minutesTaken": 88,
      "questionScores": [ { "number": 1, "score": 4, "marks": 6 } ],
      "errorTags": [ { "questionNumber": 3, "marksLost": 2,
                       "code": "unit-conversion" } ] }
  ],
  "flashcards": [
    { "cardId": "01-forces-and-motion/eq/eq-moment", "ease": 2, "dueDate": "2026-08-17",
      "history": [ { "at": "…", "rating": "got-it" } ] }
  ]
}
```

**Derived at read time, never stored.** `topicState` is computed from the two signals whenever the dashboard renders. Do not persist it — it would go stale the moment a tag or a mark changed.

```jsonc
// Computed, not saved
{
  "topicId": "01-forces-and-motion",
  "declared": "green",                     // most recent tag, or null
  "demonstrated": "weak",                  // "strong" | "mixed" | "weak" | "untested"
  "state": "blind-spot",                   // per the table in 5.2
  "evidence": {
    "questionsAttempted": 9,
    "selfRatingBreakdown": { "got-it": 2, "partly": 3, "no-idea": 4 },
    "mockScores": [ { "mockId": "mock-1", "score": 2, "marks": 8 } ],
    "errorCodes": { "unit-conversion": 3, "wording": 2 }
  },
  "examWeight": 0.16,
  "priority": 1                            // blind-spots first, then by exam weight
}
```

**Threshold suggestion for `demonstrated`** — argue for different numbers if you disagree, but pick something and state it:
`strong` ≥ 75% of available marks and ≥ 5 questions attempted · `weak` < 50% · `mixed` in between · `untested` fewer than 3 questions attempted and no mock data.

**Error codes** (fixed vocabulary, shared between diagnostic, mocks and reporting):
`knowledge` · `wording` · `maths` · `unit-conversion` · `presentation`

---

## 7. Suggested technical approach

Open to alternatives — argue for a different one in the planback if you think it's better.

**Recommendation: a static single-page app, vanilla JS, no framework, no build step.**

Rationale: one user, one machine, four weeks, and a hard requirement that it never fails to start. A React/Vite setup adds `node_modules`, a dev server, and a class of failure modes that have no upside here. The content is essentially a document with state layered on top.

- Content in `content/*.json`, loaded once at startup with `fetch`
- Views rendered by template functions into a single `<main>`
- Hash-based routing: `#/module/01`, `#/mock/1`, `#/drill`
- State in localStorage behind a small wrapper with versioned migration
- `style.css` extended, not replaced

**One caveat to solve in the planback:** `fetch` on `file://` is blocked by CORS in Chrome. Either inline the JSON as a `<script>` tag, or ship a one-line `npx serve` command. State your preference and why.

**Content extraction:** write a Node script that parses the existing HTML into the JSON schema. Do not hand-transcribe — it's error-prone and the HTML is already correctly structured with predictable class names.

---

## 8. What the planback should cover

1. Whether you agree with the no-framework recommendation, and why or why not
2. How you'll solve the `file://` problem
3. The content extraction approach, and what you expect to break — in particular, how you will generate stable `itemId`s for every taggable item
4. Your proposed UI for one-tap traffic-light tagging that works on a dense page of definitions without cluttering it. This is the hardest interaction design problem in the build. Sketch it.
5. Your thresholds for `demonstrated` strength, if you disagree with those in 6.3
6. A build order with dates, showing P0 complete by 15 August
7. Anything in the functionality spec you think is wrong, missing, or not worth building
8. What you'd cut first if you fall behind — noting that the confidence model and coach dashboard are not candidates

**Do not start coding until the planback is reviewed.**

---

## 9. Tone note

The interface should be quiet and adult. No encouragement, no exclamation marks, no character illustrations. Plain statements of fact: "12 of 48 questions attempted", "Weakest: Static electricity". He knows why he's using it.
