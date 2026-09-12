# GCSE Revision App — Physics · Chemistry · Biology

A local revision app for John's GCSEs (summer 2027). One app, one subject at a
time: open it and pick a subject from the landing page. Each subject keeps its
own content, tags, scores and flashcards, completely separately.

Current state:

- **Physics** (Edexcel iGCSE 4PH1) — complete: 8 modules, 252 MCQs, diagnostic,
  2 mocks, 3 past papers. Aimed at the Year 10 resit on **7 September 2026**,
  so it carries a countdown and revision schedule.
- **Chemistry** (Edexcel iGCSE 4CH1) — complete: 10 modules, ~415 MCQs, the
  school's 5 past papers (2021–2025) with transcribed mark schemes, exam
  reference. No exam date yet — long-haul revision, so no countdown.
- **Biology** (Edexcel iGCSE 4BI1) — registered but empty, waiting on source
  material.

## Starting the app

Double-click **`start.bat`**.

That starts a tiny local server (built into Windows — no installs) and opens
the app in the default browser. Keep the black window open while using the app;
close it to stop. If the window says the port is already in use, the server is
already running and the app has simply been opened again.

The app is at <http://localhost:8123/app.html>. Chrome and Edge both work.

## What it does (per subject)

- **Module reader** — the revision modules, with traffic-light tagging on every
  module, section, equation, definition, vocabulary trap and question. Dots in
  the left margin: hover or tap, then pick red / amber / green.
- **Red topics** — everything tagged red, across all modules, as the study queue.
- **Flashcards / drills** — definitions, traps and equations, red first; keyboard
  shortcuts: space to show, 1/2/3 to rate.
- **Multiple choice** — per module or randomised, marked instantly with an
  explanation; keys 1–4 answer, enter advances. Options are shuffled on every
  showing.
- **Papers** — timed mock mode (work on paper; the app runs the clock and locks
  the mark scheme), then mark entry with error codes: K knowledge · W wording ·
  M maths · U unit conversion · P presentation. Chemistry's five real school
  papers are wired in with transcribed mark schemes.
- **Coach view** — read-only dashboard reconciling what John says with what he
  does. Blind spots (rated green, performing weak) are pinned with evidence.
- **Specification** — every examinable spec point, coloured automatically from
  the tags already applied to the modules.
- **Exam reference** — exam-day card, formula sheet (Physics) / must-memorise
  equations (Chemistry), the technique rules distilled from the school's own
  mark-scheme commentary, and self-mark checklists for drawings.
- **The last sheet** — everything still costing marks on one printable page.

## Progress data

Progress lives in the browser's localStorage, **one store per subject**
(`physics-progress-v1`, `chemistry-progress-v1`, …), so it survives restarts
but **not** clearing browser data. *Back up everything* (landing page or a
subject's home page) writes one JSON file covering every subject; *Restore from
backup* reads it back — and still accepts old physics-only backup files.

*Sync* (sidebar) moves all subjects' progress between machines through the
hosted copy: set the same code on both, **Push** from the machine with the
newer work, **Pull** on the other.

## Layout

```
start.bat, serve.ps1       launcher + zero-dependency local server (PowerShell)
site/
  app.html, app/           the application (vanilla JS, ES modules, no build step)
  content/subjects.json    the subject registry (generated)
  content/<subject>/*.json extracted content — the app reads only these
  modules/<subject>/       the hand-authored module pages (source of truth)
  mocks/physics/           the physics mock papers + mark schemes
  papers/<subject>/        past-paper PDFs
  diagnostic/physics/      diagnostic paper + mark scheme (generated)
tools/
  subjects.js              the build config: one entry per subject
  extract.js               HTML/markdown -> content JSON (authoring-time only)
  verify.js                round-trip check that extraction lost nothing
  <subject>/               per-subject authoring inputs (MCQ banks, spec
                           points, exam reference, past-paper structure)
John School Materials/     past papers, mark schemes, info packs (reference)
Claude AI Materials/       original physics flat files + scoping memo (archive)
```

## Editing content

Edit the HTML in `site/modules/<subject>/` (or the per-subject JSON in
`tools/<subject>/`), then re-run the extraction:

```bash
cd tools && npm install && node extract.js && node verify.js
```

Adding a subject = one entry in `tools/subjects.js` plus its folders. Item
identity is content-anchored (question labels, term names, headings), so tags
survive content edits — but renaming a term or heading changes its id and
orphans any tag on it. `tools/validation-report-<subject>.md` lists anything
the extractor was unsure about.

Known content quirks (in the source material, preserved as-is):

- Physics mock 1's questions total **100 marks**, though its header says 90.
- The physics diagnostic's Section D totals **7 marks**, not the labelled 8.
- Chemistry 2021/2022 mark schemes and the 2024 paper exist only as Word files,
  so those "open the paper/scheme" links are hidden in the app — the
  transcribed mark schemes cover them.

## Phone and offline copies

**Phone copy (no JavaScript, works in iOS Quick Look):**

```bash
cd tools && node bundle-phone.js
```

Writes **`John-Physics-Phone.html`** and **`John-Chemistry-Phone.html`** — one
file per subject, no internet needed: all modules, every MCQ with answers, the
technique rules, papers with mark schemes, and the full specification. Answers
open by tapping. (`node bundle-phone.js chemistry` builds just one subject.)

**Full app, offline, one file (desktop browsers):**

```bash
cd tools && node bundle-offline.js
```

**`John-Revision-Offline.html`** is the complete interactive app — all
subjects, landing page, tagging, coach view — with no server. It will not run
from a file on an iPhone (iOS restriction); use the hosted copy there.

Both are snapshots: re-run and re-send after any content change.

## The hosted copy — the full app on a phone

The app is deployed privately at:

**<https://quiet-harbour-k7m3q.pages.dev/app>**

This is the only way to use the full interactive app on an iPhone. Open it in
Safari, then **Share → Add to Home Screen**. The URL is unlisted and served
with noindex headers — the address itself is what keeps it private.

To publish changes, double-click **`deploy.bat`**. After the first visit the
hosted app works fully offline (service worker); a deploy produces a new cache
and an open tab shows a "newer version is ready" bar rather than reloading
mid-question. Note the cache serves first and refreshes in the background, so
a just-deployed change may need that bar (or a second reload) to appear.

To verify offline support after a deploy:

```bash
cd tools && node test-offline-hosted.js
```

## What is not in this repository

This repo is public, so anything belonging to the exam board or the school is
deliberately left out:

- the past-paper and topic-test PDFs (`site/papers/`, `site/docs/`)
- the source material they were built from (`John School Materials/`)
- anything transcribed verbatim from them — question text, mark schemes and the
  Edexcel specification wording (`tools/*/past-papers*.json`,
  `tools/*/topic-tests*.json`, `tools/*/spec-points.json`, and the `mocks.json`
  and `spec.json` those generate)

What is here is the app itself and the revision content written for it: the
modules, the multiple-choice banks, the original mock papers, the exam-technique
reference and the prediction pages.

Because of that, `node tools/extract.js` will not run end-to-end from a fresh
clone — it expects those inputs locally. The generated content already in
`site/content/` is enough to run the app:

```bash
node tools/dev-server.js
```

Then open http://localhost:8124/app.html
