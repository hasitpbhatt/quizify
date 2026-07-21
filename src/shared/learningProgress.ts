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

export function computeNextReviewAt(state: 'correct' | 'partial' | 'incorrect' | 'mastered' | 'untested' | 'inProgress', now = Date.now()): number {
  switch (state) {
    case 'incorrect':
      return now;
    case 'partial':
      return now + 1 * 24 * 60 * 60 * 1000;
    case 'correct':
      return now + 3 * 24 * 60 * 60 * 1000;
    case 'mastered':
      return now + 7 * 24 * 60 * 60 * 1000;
    default:
      return now;
  }
}

export function getNextLearningAction(
  progress: LearningProgress,
  orderedConceptIds: string[],
): NextLearningAction {
  const { lastConceptId, completedConceptIds, nextReviewAtByConceptId } = progress;
  const now = Date.now();

  const completedSet = new Set(completedConceptIds ?? []);

  const remainingConceptIds = orderedConceptIds.filter(id => !completedSet.has(id));

  if (remainingConceptIds.length === 0) {
    return { kind: 'complete' };
  }

  for (const conceptId of orderedConceptIds) {
    const reviewAt = nextReviewAtByConceptId[conceptId];
    if (reviewAt && reviewAt <= now && !completedSet.has(conceptId)) {
      return { kind: 'review', conceptId };
    }
  }

  if (lastConceptId && !completedSet.has(lastConceptId) && orderedConceptIds.includes(lastConceptId)) {
    return { kind: 'continue', conceptId: lastConceptId };
  }

  return { kind: 'start', conceptId: remainingConceptIds[0] };
}
