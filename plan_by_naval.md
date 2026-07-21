# Quizify: The Learning Loop Plan

Product review lens: Naval Ravikant-style first principles, leverage, and compounding user value.

Date: 2026-07-20
Updated: 2026-07-21

## Executive decision

Quizify should stop optimizing primarily for a beautiful first lesson and start optimizing for a learner who returns and immediately knows what to do next.

The product is already becoming a calm tutor surface: notebook mode, narration, progressive reveal, quiz gating, session persistence, and a graph fallback are all useful foundations. The missing asset is learner memory.

The next build should create a small, durable learning loop:

1. Remember the learner's last meaningful concept.
2. Remember which concepts are complete.
3. Schedule simple reviews.
4. On return, present one obvious next action.
5. Turn wrong answers into remediation and a targeted retry.

The first release must be small enough to ship, inspect, and learn from. Do not redesign the generation pipeline or introduce a full spaced-repetition system yet.

## Naval-style product thesis

The durable advantage is not more generated content. Content generation is becoming cheap and abundant.

The compounding asset is a private learner model that improves with every interaction. Each quiz attempt should make the next session more relevant, reduce decision fatigue, and help Quizify teach the learner more efficiently.

The product promise should become:

> Give Quizify something worth learning. It will teach it clearly, remember where you struggled, and tell you what to do next.

Every feature should pass three tests:

- Does it improve the learner model?
- Does it reduce the effort required to continue learning?
- Does it make the next session more useful than the last one?

If the answer is no to all three, defer it.

## What is missing today

### Must-have gaps

1. **Persistent learner memory**

   `QuizData` already records attempts, scores, and states, but `Session` does not yet expose a simple concept-level learner ledger. Quizify knows what it generated, not what the learner knows, what they forgot, or where they last stopped.

2. **A return loop**

   The current welcome, progress, and canvas flow handles entering and viewing a lesson. It does not answer the returning learner's first question: "What should I do now?"

3. **Adaptive next action**

   The next action should be selected from:

   - a concept due for review;
   - the learner's last active concept;
   - the first incomplete concept;
   - a clear restart action for an empty or fully completed lesson.

4. **Remediation after mistakes**

   A score is not teaching. An incorrect answer should lead to a short correction using the existing rationale, followed by one targeted retry.

5. **Source trust**

   When source fetching falls back to subject-based AI generation, the interface should eventually distinguish source-grounded material from AI-generated teaching material. Calm tutoring requires confidence without pretending to have evidence it does not have.

### Explicitly not next

- More graph decoration.
- More quiz formats.
- Streaks, points, badges, or leaderboards.
- A general-purpose AI chat panel.
- A sophisticated SM-2 or machine-learned scheduler.
- More onboarding configuration before the first useful lesson.
- Animation that blocks reading, skimming, keyboard use, or reduced-motion users.

## Phase 1: Resume and Review slice

### Objective

After a learner generates a lesson, answers at least one quiz, leaves, and returns, Quizify should surface a personalized next action without regenerating the lesson.

### Scope

- Add optional learner-progress fields to `Session`.
- Record activity at the authoritative quiz persistence boundary.
- Compute a simple due-review schedule.
- Render a small notebook-mode cue near the existing orientation/progress controls.
- Keep the current concept unlocking behavior unchanged.
- Keep viewport restoration separate from learner mastery state.

### Session data contract

Add these optional fields for backward compatibility with existing IndexedDB sessions:

```ts
lastConceptId?: string;
completedConceptIds?: string[];
nextReviewAtByConceptId?: Record<string, number>;
lastActivityAt?: number;
```

Use optional fields rather than a database migration. Old sessions must behave exactly as they do now, with empty defaults.

Recommended normalization helper:

```ts
type NormalizedLearningProgress = {
  lastConceptId: string | null;
  completedConceptIds: string[];
  nextReviewAtByConceptId: Record<string, number>;
  lastActivityAt: number | null;
};
```

Never assume these fields exist on sessions created before this work.

### Authoritative write boundary

Use `src/features/quiz/useQuizAnswer.ts`.

Do not write progress from `QuizInteraction.tsx`. The interaction component owns modal state, while `useQuizAnswer` already has the graded answer, the authoritative session read, the updated quiz node, and the existing `updateCurrent` persistence call.

Update quiz node and learner metadata in one `updateCurrent` call to avoid intermediate states.

### Completion rule

For a quiz attempt:

1. Set `lastConceptId` to `quiz.parentConceptId`.
2. Set `lastActivityAt` to `Date.now()`.
3. Find all quizzes whose `parentConceptId` matches the same concept.
4. Treat the concept as complete only when every quiz for that concept has a correct or mastered state.
5. Add the concept to `completedConceptIds` only when complete.
6. Schedule the next review according to the simple schedule below.

Do not include the summary quiz in concept completion in this phase. Summary review is a separate product decision.

### Simple review schedule

Start with a deliberately transparent schedule:

- Incorrect: review today after the remediation retry, or leave due immediately.
- Partial: review in 1 day.
- Correct on first or later attempt: review in 3 days.
- Mastered: review in 7 days.

If the existing state model does not cleanly distinguish first-attempt correctness, use the current quiz state and best score without inventing a new grading system.

The schedule is a product experiment, not a scientific claim. The goal is to create a return loop and collect behavior before investing in a complex algorithm.

### Next-action selection

Create a pure function, ideally in `src/shared/learningProgress.ts`:

```ts
type NextLearningAction =
  | { kind: 'review'; conceptId: string }
  | { kind: 'continue'; conceptId: string }
  | { kind: 'start'; conceptId: string }
  | { kind: 'complete' };
```

Selection order:

1. First due concept from `nextReviewAtByConceptId` that still exists in the session.
2. `lastConceptId` if it still exists and is not complete.
3. First concept that is not in `completedConceptIds`.
4. `complete` if all concepts are complete.

Keep this pure and unit-test it heavily. It should not know anything about React, IndexedDB, or viewport state.

## Phase 2: Notebook experience

### Design goal

The notebook should feel like a quiet tutor leaving a useful note for the learner, not like a dashboard asking them to configure a system.

### Cue content

Use one compact cue near the existing notebook orientation area:

- Due review: `A quick review is ready`
- Continue: `Continue with [concept title]`
- Start: `Begin with [concept title]`
- Complete: `You have covered this lesson`

Secondary text should be one short sentence. Avoid progress bars, badges, urgency language, or multiple competing buttons.

Primary action labels:

- `Review now`
- `Continue`
- `Start lesson`
- `Open lesson`

The cue should be dismissible for the current session but should not erase learner progress.

### Concept progress

Show quiet orientation such as `Concept 2 of 6` near the notebook controls. This is orientation, not a score.

The existing `quizify:nbpos:*` local storage state should continue to own visual viewport restoration. Do not use it as the source of truth for learner mastery.

### Resume behavior

On canvas mount:

1. Read normalized session progress.
2. Compute the next learning action.
3. Show the cue only after the existing initial orientation delay.
4. Do not override the existing unlocked concept rules automatically in Phase 1.
5. If the learner taps the cue, focus the corresponding concept using the existing camera/focus mechanism.

This avoids changing the current pipeline and prevents a learner from being pushed into a concept whose prerequisite quiz is not yet complete.

## Phase 3: Mistake remediation

### Objective

Replace the dead end of `incorrect -> score` with `incorrect -> understand -> retry`.

### First implementation

Use existing local data before adding another LLM request:

- quiz rationale;
- correct answer;
- the learner's submitted answer;
- the existing persona tone.

Display:

1. `What to notice` with one or two sentences.
2. The correct idea, without shaming language.
3. One `Try once more` action.

Only add a new generated explanation when the rationale is absent or clearly insufficient. If an LLM call is added later, it must be abortable, provider-aware, and non-fatal.

### Retry behavior

- Keep the original attempt in history.
- Create a new attempt for the retry.
- Do not inflate mastery merely because the retry succeeds immediately after showing the answer.
- Store enough metadata to distinguish first-pass understanding from assisted recovery later.

This should be measured before adding more question generation.

## Phase 4: Trust and source clarity

Add a low-friction source label to the lesson header or orientation note:

- `Based on this source` when the server-side fetch succeeded.
- `Teaching from the topic` when the URL-derived subject fallback generated the lesson.

Do not expose internal proxy details. The learner only needs to know whether Quizify is teaching from fetched source material or constructing a lesson from the topic.

If citations are added, keep them attached to the relevant concept rather than adding a reference-heavy page that interrupts learning.

## File-by-file implementation map

### Phase 1 files

- `src/shared/types.ts`
  - Add optional session learner fields.

- `src/shared/learningProgress.ts`
  - Add normalization, due-review calculation, and next-action selection.
  - Keep all functions pure except the small serializer if one is needed.

- `src/features/quiz/useQuizAnswer.ts`
  - Compute concept completion and schedule.
  - Persist node updates and learner metadata together.

- `src/features/canvas/CanvasPage.tsx`
  - Read the current session progress.
  - Derive the next action.
  - Render the cue and concept orientation.
  - Focus the selected concept only through existing canvas focus behavior.

- `src/styles/notebook.css`
  - Add the cue styles using existing notebook tokens.
  - Preserve dark theme and reduced motion behavior.

### Tests

- `tests/shared/learningProgress.test.ts`
  - empty and legacy session defaults;
  - due review detection;
  - due review priority over continue;
  - continue priority over first incomplete;
  - complete state;
  - duplicate completed concept protection;
  - malformed persisted data fallback.

- `tests/features/quiz/useQuizAnswer.test.ts`
  - last concept is recorded;
  - completed concept is recorded only when all sibling quizzes are correct;
  - summary quizzes do not complete a concept;
  - learner metadata and updated quiz node persist together;
  - legacy session fields remain safe.

- `tests/features/canvas/CanvasPage.test.tsx`
  - due review cue;
  - continue cue;
  - dismissed cue;
  - no cue for an empty session;
  - reduced-motion behavior remains CSS-level and non-blocking.

## Verification checklist

Before considering Phase 1 complete:

- Generate a new lesson.
- Answer one quiz incorrectly.
- Confirm the quiz attempt and learner metadata survive a reload.
- Answer the quiz correctly.
- Confirm the concept is not marked complete until all sibling quizzes are correct.
- Close and reopen the app.
- Confirm the next action is visible and understandable within two seconds.
- Complete all concepts and confirm the cue changes to a completion state.
- Load a pre-existing IndexedDB session with no new fields.
- Confirm no crash, no migration prompt, and no changed generation behavior.
- Test notebook and graph mode.
- Test mobile focus view.
- Test dark theme.
- Test `prefers-reduced-motion`.
- Run typecheck, lint, and the targeted tests.

## Success metrics

Instrument later, but define the behavior now:

1. Percentage of generated lessons with at least one quiz attempt.
2. Percentage of learners who return to the same lesson.
3. Time from app reopen to first meaningful action.
4. Percentage of incorrect attempts followed by a retry.
5. Concept completion rate.
6. Review completion rate when a concept becomes due.

The key qualitative test is:

> After returning to Quizify, does the learner immediately understand what to do next without opening a menu or remembering where they stopped?

If not, do not add more polish. Fix the return loop.

## Suggested build order

1. Finish and test the pure learning-progress functions.
2. Add optional session fields.
3. Integrate the quiz persistence boundary.
4. Add the notebook cue and concept orientation.
5. Verify legacy sessions and mobile behavior.
6. Add remediation using existing rationale.
7. Add source-grounding labels.
8. Observe real usage before expanding the scheduler or adding gamification.

## Definition of done for the first handoff

The first handoff is complete when a learner can:

1. Generate a lesson.
2. Learn and answer at least one quiz.
3. Leave the app.
4. Return later.
5. See an obvious `Continue` or `Review now` action.
6. Continue without re-reading the entire lesson or searching through session history.

That is the first moment Quizify behaves like a tutor rather than a document generator.

## Update 2026-07-21 — Full-experience review pass

A Naval-style review of the end-to-end experience (welcome → progress → canvas → quiz → return) surfaced ten critical issues. Most are not learner-memory features; they are friction, positioning, or copy fixes that block the value of the loop above. Tracking issues are linked below.

### The return loop is still a lie at the front door

The in-canvas learning cue (Phases 1–2) was shipped. The actual moment of return — the Welcome screen — was not. A returning learner still scans the session list and remembers where they stopped before the in-canvas cue can help.

**Fix:** Surface one obvious primary action on the Welcome screen for the most-recent non-complete session. Data already exists; only the UI is missing. See [issue #30](https://github.com/hasitpbhatt/quizify/issues/30).

### First-session friction is too high

The persona grid blocks `submitEnabled` for new users. Asking a learner to self-diagnose as "curious vs expert" before they have seen a single generated lesson is a 90s onboarding pattern. Default to `curious`; shrink the grid to visually secondary. See [issue #31](https://github.com/hasitpbhatt/quizify/issues/31).

This is the single change most likely to lift first-session completion — likely larger impact than any Phase 1 feature.

### The progress screen exposes implementation, not patience

Seven labeled pipeline stages (fetch → outline → detail → quiz → summary → build → done) are rendered as a seven-row list. The user does not perceive seven distinct waits. Collapse to three mental-model states: *Reading source → Building lesson → Ready*. Keep the seven stages for `latencyStore` only. See [issue #32](https://github.com/hasitpbhatt/quizify/issues/32).

### Notebook mode's escape hatch is invisible

The orientation cue (`CanvasPage.tsx:1008–1020`) only fires when `unlockedConceptIndex === 0`, so returning mid-lesson users see nothing. The canvas graph — the marketing differentiator — is gated behind Esc, which the user has no reason to try. Two-word fix in the Notebook pill: `Notebook · Esc to exit`. See [issue #33](https://github.com/hasitpbhatt/quizify/issues/33).

### Phase 3 (quiz remediation) is still the biggest learning-quality gap

The plan above already specifies it. The review confirmed the dead-end is still present in the product: incorrect answer → rationale block → "Try Again" from scratch, no scaffolded remediation. The `Reset quiz` button next to `Try Again` is also dangerous — one accidental click erases attempt history. Ship Phase 3. See [issue #34](https://github.com/hasitpbhatt/quizify/issues/34).

### Welcome session cards punish engagement

Mastery %, computed from `(correct | mastered) / total` quizzes, means a user who started a lesson and got everything wrong shows 0% — visually worse than a fresh session showing nothing. Hide mastery % until at least one quiz is graded; replace with completion-style copy (`3 of 4 concepts done`). See [issue #35](https://github.com/hasitpbhatt/quizify/issues/35).

### Canvas corner attribution dilutes brand

`hasit.in` link at `opacity: 0.5` in the bottom-right corner of the canvas looks like an "About" placeholder on the most valuable pixel real estate (where export controls live in every other canvas app). Move to the toolbar as a byline. See [issue #36](https://github.com/hasitpbhatt/quizify/issues/36).

### Default view (Notebook vs Graph) is half-pregnant on positioning

Welcome copy promises `a canvas you actually remember` with `draggable node graph`; UX delivers a single-concept Notebook forced by `App.tsx:233`. Pick one and align copy with behavior. See [issue #37](https://github.com/hasitpbhatt/quizify/issues/37).

### Engineer-facing escape hatches shipped in prod

`LatencyPanel`, `?nbFit=0` kill switch, and `isDebugMode` URL plumbing are all reachable from production URLs. No debug affordance should ship in a prod build; either fix the underlying math (live-fit refits) and remove the kill switch, or document why it's permanent. See [issue #38](https://github.com/hasitpbhatt/quizify/issues/38).

### Full-screen quiz modal breaks Notebook calm flow

`QuizInteraction.tsx` pops a fixed full-screen modal for every quiz, even in Notebook mode where the promise is "stay here and read." The canvas already supports inline quiz reveal via `revealedQuizIds` gating — lean into that. Split the interaction surface by mode: modal in graph mode, inline in notebook mode. See [issue #39](https://github.com/hasitpbhatt/quizify/issues/39).

## Revised calculations on leverage

Of the ten issues above, four have outsized impact relative to effort:

1. **#31 (persona default)** — 33 lines of change, unblocks every first-session.
2. **#30 (welcome return action)** — one component, data already present, completes the return loop.
3. **#34 (quiz remediation)** — already specified as Phase 3; the largest learning-quality gap.
4. **#35 (session cards punish engagement)** — CSS + copy, removes a silent anti-onboarding signal.

Ship these four before any Phase 4+ work on source trust or scheduling. They are not new features; they are the loop described in this plan finally being honest at every step of the user's journey.

## Tracker

- [x] #30 Welcome return action — shipped in c62fa05
- [x] #31 Persona grid visually secondary — shrink grid, reduce visual weight
- [x] #32 Collapse progress states — 7 stages → 3 mental-model states
- [x] #33 Notebook Esc discoverability — shipped in 0c07bcd + c62fa05
- [x] #34 Phase 3 quiz remediation — scaffolded retry with rationale
- [x] #35 Welcome session cards — shipped in c62fa05
- [x] #36 Canvas corner attribution — shipped in c62fa05
- [x] #37 Default view positioning — shipped, notebook default, copy aligned
- [x] #38 Debug affordances in prod — guard/remove LatencyPanel, nbFit, isDebugMode
- [ ] #39 Quiz modal vs inline in notebook — modal in graph, inline in notebook
