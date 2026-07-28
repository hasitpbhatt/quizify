import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SummaryQuizInteraction } from '@/features/quiz/SummaryQuizInteraction';
import type { QuizData } from '@/shared/types';

vi.mock('@/features/quiz/formats/MultipleChoice', () => ({
  MultipleChoice: ({ onSubmit, disabled }: { onSubmit: (answer: string) => void; disabled: boolean }) => (
    <button disabled={disabled} onClick={() => onSubmit('wrong')}>
      Answer multiple choice
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/FillBlank', () => ({
  FillBlank: ({ onSubmit, disabled }: { onSubmit: (answer: string) => void; disabled: boolean }) => (
    <button disabled={disabled} onClick={() => onSubmit('powerhouse')}>
      Answer fill blank
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/Ordering', () => ({
  Ordering: ({
    onSubmit,
    disabled,
  }: {
    onSubmit: (answer: string[]) => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onSubmit(['First', 'Second'])}>
      Answer ordering
    </button>
  ),
}));

function makeQuiz(overrides: Partial<QuizData> = {}): QuizData {
  return {
    kind: 'quiz',
    parentConceptId: 'summary',
    format: 'multipleChoice',
    prompt: 'Question?',
    options: ['right', 'wrong'],
    correctAnswer: 'right',
    rationale: 'Because.',
    attempts: [],
    state: 'untested',
    ...overrides,
  };
}

function renderSummary(
  quizData: QuizData[],
  initialScores: Record<string, { best: number; attempts: number }> = {},
) {
  const onUpdateScores = vi.fn();
  const onRetake = vi.fn();
  render(
    <SummaryQuizInteraction
      quizData={quizData}
      initialScores={initialScores}
      onUpdateScores={onUpdateScores}
      onRetake={onRetake}
      onClose={vi.fn()}
    />,
  );
  return { onUpdateScores, onRetake };
}

describe('SummaryQuizInteraction', () => {
  it('keeps results unavailable until the final question is answered', () => {
    renderSummary([makeQuiz()]);
    expect(screen.getByRole('button', { name: 'Show Results' })).toBeDisabled();
  });

  it('uses acceptable fill-blank answers and announces the result', async () => {
    renderSummary([
      makeQuiz({
        format: 'fillBlank',
        correctAnswer: 'mitochondria',
        acceptableAnswers: ['powerhouse'],
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Answer fill blank' }));
    expect(await screen.findByText('Answer correct.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show Results' }));

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('grades ordering against the ordered items', async () => {
    renderSummary([
      makeQuiz({
        format: 'ordering',
        items: ['First', 'Second'],
        correctAnswer: 'A differently formatted answer',
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Answer ordering' }));
    expect(await screen.findByText('Answer correct.')).toBeInTheDocument();
  });

  it('uses total questions as the mastery denominator', async () => {
    renderSummary(
      [
        makeQuiz({ prompt: 'Previously correct?' }),
        makeQuiz({ prompt: 'Now incorrect?' }),
      ],
      { '0': { best: 1, attempts: 1 } },
    );

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Answer multiple choice' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Show Results' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show Results' }));

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('preserves best score and increments attempts on retake', async () => {
    const { onUpdateScores, onRetake } = renderSummary(
      [makeQuiz()],
      { '0': { best: 1, attempts: 2 } },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Results' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retake All' }));
    expect(onRetake).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Answer multiple choice' }));
    await waitFor(() =>
      expect(onUpdateScores).toHaveBeenLastCalledWith({
        '0': { best: 1, attempts: 3 },
      }),
    );
  });
});
