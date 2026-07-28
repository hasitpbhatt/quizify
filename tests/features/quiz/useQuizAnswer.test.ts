import { describe, it, expect, vi } from 'vitest';
import { localGrade, computeState } from '@/features/quiz/useQuizAnswer';
import { gradeQuizAnswer } from '@/features/quiz/quizGrading';
import type { QuizData, Attempt } from '@/shared/types';

const mockExecutePromptTask = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/promptTask', () => ({
  executePromptTask: mockExecutePromptTask,
}));

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
    expect(localGrade(q, 'A').grade).toBe('correct');
    expect(localGrade(q, 'a').grade).toBe('correct');
  });

  it('returns incorrect when answer does not match', () => {
    const q = makeQuiz({ format: 'trueFalse', correctAnswer: 'True' });
    expect(localGrade(q, 'False').grade).toBe('incorrect');
  });

  it('returns idealAnswer as correctAnswer', () => {
    const q = makeQuiz({ correctAnswer: 'Paris' });
    expect(localGrade(q, 'London').idealAnswer).toBe('Paris');
  });

  it('sets gradingModel to local', () => {
    const q = makeQuiz({ format: 'multipleChoice' });
    expect(localGrade(q, 'A').gradingModel).toBe('local');
  });
});

describe('localGrade (fillBlank)', () => {
  it('returns correct when given matches correctAnswer', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'photosynthesis', acceptableAnswers: ['photosynthesis'] });
    expect(localGrade(q, 'photosynthesis').grade).toBe('correct');
  });

  it('returns correct when given matches an acceptable answer', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'photosynthesis', acceptableAnswers: ['photosynthesis'] });
    expect(localGrade(q, 'photosynthesis').grade).toBe('correct');
  });

  it('returns incorrect when given matches nothing', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'photosynthesis', acceptableAnswers: ['photosynthesis'] });
    expect(localGrade(q, 'respiration').grade).toBe('incorrect');
  });

  it('handles case-insensitive matching', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'Paris', acceptableAnswers: ['Paris'] });
    expect(localGrade(q, 'paris').grade).toBe('correct');
  });

  it('handles substring matching with acceptable answers', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'the mitochondria', acceptableAnswers: ['mitochondria'] });
    expect(localGrade(q, 'the mitochondria is the powerhouse').grade).toBe('correct');
  });

  it('does not treat an empty answer as acceptable', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'Paris', acceptableAnswers: ['Paris'] });
    expect(localGrade(q, '').grade).toBe('incorrect');
  });

  it('sets gradingModel to local', () => {
    const q = makeQuiz({ format: 'fillBlank', correctAnswer: 'Paris', acceptableAnswers: ['Paris'] });
    expect(localGrade(q, 'Paris').gradingModel).toBe('local');
  });
});

describe('localGrade (ordering)', () => {
  it('returns correct when order matches exactly', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGrade(q, ['A', 'B', 'C']).grade).toBe('correct');
  });

  it('returns partial when some items are wrong', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGrade(q, ['C', 'B', 'A']).grade).toBe('partial');
  });

  it('returns incorrect when lengths differ', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGrade(q, ['A', 'B']).grade).toBe('incorrect');
  });

  it('handles case-insensitive ordering comparison', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGrade(q, ['a', 'b', 'c']).grade).toBe('correct');
  });

  it('sets gradingModel to local', () => {
    const q = makeQuiz({ format: 'ordering', correctAnswer: 'A,B,C', items: ['A', 'B', 'C'] });
    expect(localGrade(q, ['A', 'B', 'C']).gradingModel).toBe('local');
  });
});

describe('localGrade (unknown format)', () => {
  it('returns incorrect with fallback message', () => {
    const q = makeQuiz({ format: 'freeText' as any, correctAnswer: '42' });
    const result = localGrade(q, 'anything');
    expect(result.grade).toBe('incorrect');
    expect(result.rationale).toBe('Cannot grade this format locally.');
  });
});

describe('gradeQuizAnswer (semantic formats)', () => {
  it('uses the existing grade prompt task for short answers', async () => {
    mockExecutePromptTask.mockResolvedValueOnce({
      grade: 'partial',
      rationale: 'The main idea is present.',
      idealAnswer: 'A complete explanation.',
    });
    const quiz = makeQuiz({ format: 'shortAnswer', correctAnswer: 'A complete explanation.' });

    await expect(gradeQuizAnswer(quiz, 'A related explanation.')).resolves.toMatchObject({
      grade: 'partial',
    });
    expect(mockExecutePromptTask).toHaveBeenCalledOnce();
  });

  it('sets gradingModel to llm when LLM succeeds', async () => {
    mockExecutePromptTask.mockResolvedValueOnce({
      grade: 'correct',
      rationale: 'Correct!',
      idealAnswer: '42',
    });
    const quiz = makeQuiz({ format: 'freeText', correctAnswer: '42' });

    const result = await gradeQuizAnswer(quiz, '42');
    expect(result.gradingModel).toBe('llm');
  });

  it('sets gradingModel to fuzzy when LLM fails', async () => {
    mockExecutePromptTask.mockRejectedValueOnce(new Error('LLM unavailable'));
    const quiz = makeQuiz({ format: 'shortAnswer', correctAnswer: 'Paris' });

    const result = await gradeQuizAnswer(quiz, 'Paris');
    expect(result.gradingModel).toBe('fuzzy');
  });
});

describe('computeState', () => {
  it('returns untested when no attempts', () => {
    expect(computeState([])).toBe('untested');
  });

  it('returns correct when best attempt is correct', () => {
    const attempts: Attempt[] = [
      { timestamp: 1, given: 'wrong', grade: 'incorrect' },
      { timestamp: 2, given: 'right', grade: 'correct' },
    ];
    expect(computeState(attempts)).toBe('correct');
  });

  it('returns inProgress when best attempt is partial', () => {
    const attempts: Attempt[] = [
      { timestamp: 1, given: 'close', grade: 'partial' },
    ];
    expect(computeState(attempts)).toBe('inProgress');
  });

  it('returns incorrect when all attempts are incorrect', () => {
    const attempts: Attempt[] = [
      { timestamp: 1, given: 'a', grade: 'incorrect' },
      { timestamp: 2, given: 'b', grade: 'incorrect' },
    ];
    expect(computeState(attempts)).toBe('incorrect');
  });

  it('picks best grade over chronological order', () => {
    const attempts: Attempt[] = [
      { timestamp: 2, given: 'later', grade: 'incorrect' },
      { timestamp: 1, given: 'earlier', grade: 'correct' },
    ];
    expect(computeState(attempts)).toBe('correct');
  });
});
