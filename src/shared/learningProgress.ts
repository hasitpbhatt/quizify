export type LearningProgress = {
  lastConceptId: string | null;
  completedConceptIds: string[];
  nextReviewAtByConceptId: Record<string, number>;
  lastActivityAt: number | null;
};

export type NextLearningAction =
  | { kind: 'review'; conceptId: string }
  | { kind: 'continue'; conceptId: string }
  | { kind: 'start'; conceptId: string }
  | { kind: 'complete' };

export function normalizeLearningProgress(
  lastConceptId: string | null | undefined,
  completedConceptIds: string[] | undefined,
  nextReviewAtByConceptId: Record<string, number> | undefined,
  lastActivityAt: number | null | undefined,
): LearningProgress {
  return {
    lastConceptId: lastConceptId ?? null,
    completedConceptIds: completedConceptIds ?? [],
    nextReviewAtByConceptId: nextReviewAtByConceptId ?? {},
    lastActivityAt: lastActivityAt ?? null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Spaced-review baseline (roadmap §6.3): a correct answer advances the interval
// through 1 → 3 → 7 → 14 → 30 days as the success streak grows. `mastered` is
// the cap of the schedule. Incorrect/partial/untested keep the concept in the
// near-term review pool so nothing silently drops out of rotation.
const CORRECT_INTERVALS_DAYS = [1, 3, 7, 14, 30];

export function computeNextReviewAt(
  state: 'correct' | 'partial' | 'incorrect' | 'mastered' | 'untested' | 'inProgress',
  now = Date.now(),
  successStreak = 0,
): number {
  if (state === 'incorrect' || state === 'untested' || state === 'inProgress') return now;
  if (state === 'partial') return now + 1 * DAY_MS;
  if (state === 'mastered') return now + 30 * DAY_MS;

  // Clamp streak into the interval table; streak 0 = first success → 1 day.
  const streakIdx = Math.min(Math.max(0, successStreak), CORRECT_INTERVALS_DAYS.length - 1);
  return now + CORRECT_INTERVALS_DAYS[streakIdx] * DAY_MS;
}

export function getNextLearningAction(
  progress: LearningProgress,
  orderedConceptIds: string[],
): NextLearningAction {
  const { lastConceptId, completedConceptIds, nextReviewAtByConceptId } = progress;
  const now = Date.now();

  // 1. Check for due reviews first (even if completed in the past!)
  for (const conceptId of orderedConceptIds) {
    const reviewAt = nextReviewAtByConceptId[conceptId];
    if (reviewAt && reviewAt <= now) {
      return { kind: 'review', conceptId };
    }
  }

  const completedSet = new Set(completedConceptIds ?? []);
  const remainingConceptIds = orderedConceptIds.filter((id) => !completedSet.has(id));

  // 2. Check for in-progress concept continuation
  if (
    lastConceptId &&
    !completedSet.has(lastConceptId) &&
    orderedConceptIds.includes(lastConceptId)
  ) {
    return { kind: 'continue', conceptId: lastConceptId };
  }

  // 3. Start remaining uncompleted concept
  if (remainingConceptIds.length > 0) {
    return { kind: 'start', conceptId: remainingConceptIds[0] };
  }

  return { kind: 'complete' };
}
