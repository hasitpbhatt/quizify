import { describe, it, expect } from 'vitest';
import {
  normalizeLearningProgress,
  computeNextReviewAt,
  getNextLearningAction,
} from '@/shared/learningProgress';
import type { LearningProgress } from '@/shared/learningProgress';

describe('normalizeLearningProgress', () => {
  it('returns defaults for nullish inputs', () => {
    const p = normalizeLearningProgress(null, undefined, undefined, undefined);
    expect(p.lastConceptId).toBeNull();
    expect(p.completedConceptIds).toEqual([]);
    expect(p.nextReviewAtByConceptId).toEqual({});
    expect(p.lastActivityAt).toBeNull();
  });

  it('preserves provided values', () => {
    const p = normalizeLearningProgress('c1', ['c2'], { c3: 100 }, 500);
    expect(p.lastConceptId).toBe('c1');
    expect(p.completedConceptIds).toEqual(['c2']);
    expect(p.nextReviewAtByConceptId).toEqual({ c3: 100 });
    expect(p.lastActivityAt).toBe(500);
  });

  it('preserves null lastActivityAt', () => {
    const p = normalizeLearningProgress(null, [], {}, null);
    expect(p.lastActivityAt).toBeNull();
    expect(p.lastConceptId).toBeNull();
  });
});

describe('computeNextReviewAt', () => {
  it('returns now for incorrect', () => {
    const now = 1000;
    expect(computeNextReviewAt('incorrect', now)).toBe(now);
  });

  it('returns now + 1 day for partial', () => {
    const now = 1000;
    expect(computeNextReviewAt('partial', now)).toBe(now + 86400000);
  });

  it('returns now + 3 days for correct', () => {
    const now = 1000;
    expect(computeNextReviewAt('correct', now)).toBe(now + 259200000);
  });

  it('returns now + 7 days for mastered', () => {
    const now = 1000;
    expect(computeNextReviewAt('mastered', now)).toBe(now + 604800000);
  });

  it('returns now for untested', () => {
    const now = 1000;
    expect(computeNextReviewAt('untested', now)).toBe(now);
  });

  it('returns now for inProgress', () => {
    const now = 1000;
    expect(computeNextReviewAt('inProgress', now)).toBe(now);
  });
});

describe('getNextLearningAction', () => {
  const conceptIds = ['c1', 'c2', 'c3'];

  it('returns complete when all concepts are completed', () => {
    const progress: LearningProgress = {
      lastConceptId: 'c3',
      completedConceptIds: ['c1', 'c2', 'c3'],
      nextReviewAtByConceptId: {},
      lastActivityAt: null,
    };
    expect(getNextLearningAction(progress, conceptIds)).toEqual({ kind: 'complete' });
  });

  it('returns complete for empty concept list', () => {
    const progress: LearningProgress = {
      lastConceptId: null,
      completedConceptIds: [],
      nextReviewAtByConceptId: {},
      lastActivityAt: null,
    };
    expect(getNextLearningAction(progress, [])).toEqual({ kind: 'complete' });
  });

  it('prioritises due review over continue', () => {
    const now = Date.now();
    const progress: LearningProgress = {
      lastConceptId: 'c2',
      completedConceptIds: [],
      nextReviewAtByConceptId: { c1: now - 1000 },
      lastActivityAt: now,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'review', conceptId: 'c1' });
  });

  it('does not return due review for completed concepts', () => {
    const now = Date.now();
    const progress: LearningProgress = {
      lastConceptId: null,
      completedConceptIds: ['c1'],
      nextReviewAtByConceptId: { c1: now - 1000 },
      lastActivityAt: now,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action.kind).not.toBe('review');
  });

  it('returns continue with lastConceptId when not due', () => {
    const now = Date.now();
    const progress: LearningProgress = {
      lastConceptId: 'c2',
      completedConceptIds: ['c1'],
      nextReviewAtByConceptId: {},
      lastActivityAt: now,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'continue', conceptId: 'c2' });
  });

  it('returns continue even when lastConceptId has due review in future', () => {
    const now = Date.now();
    const progress: LearningProgress = {
      lastConceptId: 'c2',
      completedConceptIds: [],
      nextReviewAtByConceptId: { c2: now + 86400000 },
      lastActivityAt: now,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'continue', conceptId: 'c2' });
  });

  it('falls through to start when lastConceptId is completed', () => {
    const now = Date.now();
    const progress: LearningProgress = {
      lastConceptId: 'c1',
      completedConceptIds: ['c1'],
      nextReviewAtByConceptId: {},
      lastActivityAt: now,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'start', conceptId: 'c2' });
  });

  it('falls through to start when lastConceptId no longer exists', () => {
    const now = Date.now();
    const progress: LearningProgress = {
      lastConceptId: 'c_old',
      completedConceptIds: [],
      nextReviewAtByConceptId: {},
      lastActivityAt: now,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'start', conceptId: 'c1' });
  });

  it('returns start with first incomplete concept', () => {
    const progress: LearningProgress = {
      lastConceptId: null,
      completedConceptIds: [],
      nextReviewAtByConceptId: {},
      lastActivityAt: null,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'start', conceptId: 'c1' });
  });

  it('skips completed concepts and picks next incomplete', () => {
    const progress: LearningProgress = {
      lastConceptId: null,
      completedConceptIds: ['c1', 'c2'],
      nextReviewAtByConceptId: {},
      lastActivityAt: null,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'start', conceptId: 'c3' });
  });

  it('handles malformed data gracefully (undefined completedConceptIds)', () => {
    const progress = normalizeLearningProgress(null, undefined, {}, null);
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'start', conceptId: 'c1' });
  });

  it('handles duplicate completed concept IDs', () => {
    const progress: LearningProgress = {
      lastConceptId: null,
      completedConceptIds: ['c1'],
      nextReviewAtByConceptId: {},
      lastActivityAt: null,
    };
    const action = getNextLearningAction(progress, conceptIds);
    expect(action).toEqual({ kind: 'start', conceptId: 'c2' });
  });
});
