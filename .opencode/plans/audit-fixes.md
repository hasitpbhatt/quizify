# Audit Fixes Plan

## Fix 1: Wire summary quiz persistence to IndexedDB
**Problem**: SummaryQuizInteraction stores results in sessionStorage (lost on tab close). Session.scores declared but never written.
**Files**: `src/features/quiz/SummaryQuizInteraction.tsx`, `src/features/canvas/CanvasPage.tsx`
**Approach**:
- Add `initialScores` + `onUpdateScores` props to SummaryQuizInteraction
- Replace sessionStorage reads/writes with props
- CanvasPage migrates sessionStorage → IDB via useEffect + updateCurrent

## Fix 2: Remove 4 empty scaffold directories
**Dirs**: `src/features/sessions/`, `src/features/settings/`, `src/features/canvas/layout/`, `src/features/generation/prompts/`

## Fix 3: Update stale values in AGENTS.md
CSS widths: 390/360/450/360 → 420/380/480/380; notebook max-width: 450 → 500; CONCURRENCY: Infinity → 1

## Fix 4: Extract `__summary__` as named constant
Export `SUMMARY_NODE_ID = '__summary__'` from shared/constants.ts, update 3 files (5 occurrences)

## Fix 5: Add unit tests for 6 quiz format components
One test file per format in `tests/features/quiz/formats/`

## Order: 1 → 2 → 3 → 4 → 5
