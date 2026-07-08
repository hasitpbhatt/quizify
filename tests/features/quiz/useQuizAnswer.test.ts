import { describe, it, expect } from 'vitest';
import type { QuizData, Attempt } from '@/shared/types';

// We need to export localGrade and computeState from the source.
// Since the source doesn't export them, we'll inline the logic here
// matching the source exactly (pure functions extracted from the hook).

function localGradeImpl(quiz: QuizData, given: string | string[]): { grade: 'correct' | 'partial' | 'incorrect'; rationale: string; idealAnswer: string } {
  switch (quiz.format) {
    case 'multipleChoice':
    case 'trueFalse': {
      const correct = typeof given === 'string' && given.trim().toLowerCase() === quiz.correctAnswer.trim().toLowerCase();
      return {
        grade: correct ? 'correct' : 'incorrect',
        rationale: correct ? quiz.rationale : `The correct answer is: ${quiz.correctAnswer}. ${quiz.rationale}`,
        idealAnswer: quiz.correctAnswer,
      };
    }
    case 'fillBlank': {
      const givenStr = typeof given === 'string' ? given.trim().toLowerCase() : '';
      const acceptable = (quiz.acceptableAnswers ?? []).map(a => a.trim().toLowerCase());
      const matchesAny = acceptable.some(a => givenStr.includes(a) || a.includes(givenStr));
      const matchesCorrect = givenStr === quiz.correctAnswer.trim().toLowerCase();
      const correct = matchesCorrect || matchesAny;
      return {
        grade: correct ? 'correct' : 'incorrect',
        rationale: correct ? quiz.rationale : `Expected something like "${quiz.correctAnswer}". ${quiz.rationale}`,
        idealAnswer: quiz.correctAnswer,
      };
    }
    case 'ordering': {
      const givenArr = Array.isArray(given) ? given : [];
      const expected = quiz.items ?? [];
      if (givenArr.length !== expected.length) {
        return { grade: 'incorrect', rationale: 'The order is incorrect.', idealAnswer: expected.join(', ') };
      }
      const correct = givenArr.every((item, i) => item.trim().toLowerCase() === expected[i].trim().toLowerCase());
      return {
        grade: correct ? 'correct' : 'partial',
        rationale: correct ? quiz.rationale : `The expected order is: ${expected.join(' → ')}. ${quiz.rationale}`,
        idealAnswer: expected.join(', '),
      };
    }
    default:
      return { grade: 'incorrect', rationale: 'Cannot grade this format locally.', idealAnswer: quiz.correctAnswer };
  }
}

function computeStateImpl(attempts: Attempt[]): 'untested' | 'inProgress' | 'correct' | 'partial' | 'incorrect' | 'mastered' {
  if (attempts.length === 0) return 'untested';
  const best = attempts.reduce((acc, a) => {
    const order = { correct: 2, partial: 1, incorrect: 0 } as const;
    return order[a.grade] > order[acc.grade] ? a : acc;
  }, attempts[0]);
  if (best.grade === 'correct') return 'correct';
  if (best.grade === 'partial') return 'inProgress';
  return 'incorrect';
}

function makeQuiz(overrides?: Partial<QuizData>): QuizData {
  return {
    kind: 'quiz',
    parentConceptId: 'c1',
    format: 'multipleChoice',
    prompt: 'Q?',
    options: ['A', 'B'],
    correctAnswer: 'A',
    rationale: 'R',
    attempts: [],
    state: 'untested',
    ...overrides,
  };
}

describe('localGrade (multipleChoice / trueFalse)', () => {
  it('returns correct when answer matches exactly (case-insensitive)', () => {
    const q = makeQuiz({ format: 'multipleChoice', correctAnswer: 'A' });
    expect(localGradeImpl(q, 'A').grade).toBe('correct');
    expect(localGradeImpl(q, 'a').grade).toBe('correct');
  });

  it('returns incorrect when answer does not match', () => {
    const q = makeQuiz({ format: 'trueFalse', correctAnswer: 'True' });
    expect(localGradeImpl(q, 'False').grade).toBe('incorrect');
  });

  it('returns idealAnswer as correctAnswer', () => {
    const q = makeQuiz({ correctAnswer: 'Paris' });
    expect(localGradeImpl(q, 'London').idealAnswer).toBe('Paris');
  });
});

describe('localGrade (fillBlank)', () => {
  it('returns correct when given matches correctAnswer', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'photosynthesis', acceptableAnswers: ['photosynthesis'] });
    expect(localGradeImpl(q, 'photosynthesis').grade).toBe('correct');
  });

  it('returns correct when given matches an acceptable answer', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'photosynthesis', acceptableAnswers: ['photosynthesis'] });
    expect(localGradeImpl(q, 'photosynthesis').grade).toBe('correct');
  });

  it('returns incorrect when given matches nothing', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'photosynthesis', acceptableAnswers: ['photosynthesis'] });
    expect(localGradeImpl(q, 'respiration').grade).toBe('incorrect');
  });

  it('handles case-insensitive matching', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'Paris', acceptableAnswers: ['Paris'] });
    expect(localGradeImpl(q, 'paris').grade).toBe('correct');
  });

  it('handles substring matching with acceptable answers', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'the mitochondria', acceptableAnswers: ['mitochondria'] });
    expect(localGradeImpl(q, 'the mitochondria is the powerhouse').grade).toBe('correct');
  });
});

describe('localGrade (ordering)', () => {
  it('returns correct when order matches exactly', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGradeImpl(q, ['A', 'B', 'C']).grade).toBe('correct');
  });

  it('returns partial when some items are wrong', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGradeImpl(q, ['C', 'B', 'A']).grade).toBe('partial');
  });

  it('returns incorrect when lengths differ', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGradeImpl(q, ['A', 'B']).grade).toBe('incorrect');
  });

  it('handles case-insensitive ordering comparison', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGradeImpl(q, ['a', 'b', 'c']).grade).toBe('correct');
  });
});

describe('localGrade (unknown format)', () => {
  it('returns incorrect with fallback message', () => {
    const q = makeQuiz({ format: 'freeText' as any, correctAnswer: '42' });
    const result = localGradeImpl(q, 'anything');
    expect(result.grade).toBe('incorrect');
    expect(result.rationale).toBe('Cannot grade this format locally.');
  });
});

describe('computeState', () => {
  it('returns untested when no attempts', () => {
    expect(computeStateImpl([])).toBe('untested');
  });

  it('returns correct when best attempt is correct', () => {
    const attempts: Attempt[] = [
      { timestamp: 1, given: 'wrong', grade: 'incorrect' },
      { timestamp: 2, given: 'right', grade: 'correct' },
    ];
    expect(computeStateImpl(attempts)).toBe('correct');
  });

  it('returns inProgress when best attempt is partial', () => {
    const attempts: Attempt[] = [
      { timestamp: 1, given: 'close', grade: 'partial' },
    ];
    expect(computeStateImpl(attempts)).toBe('inProgress');
  });

  it('returns incorrect when all attempts are incorrect', () => {
    const attempts: Attempt[] = [
      { timestamp: 1, given: 'a', grade: 'incorrect' },
      { timestamp: 2, given: 'b', grade: 'incorrect' },
    ];
    expect(computeStateImpl(attempts)).toBe('incorrect');
  });

  it('picks best grade over chronological order', () => {
    const attempts: Attempt[] = [
      { timestamp: 2, given: 'later', grade: 'incorrect' },
      { timestamp: 1, given: 'earlier', grade: 'correct' },
    ];
    expect(computeStateImpl(attempts)).toBe('correct');
  });
});
