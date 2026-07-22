import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { QuizData } from '@/shared/types';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';

const mockSubmit = vi.hoisted(() => vi.fn());
const mockUseQuizAnswer = vi.hoisted(() => vi.fn<(...args: unknown[]) => {
  submit: typeof mockSubmit;
  submitting: boolean;
  error: string | null;
  attempts: Array<Record<string, unknown>>;
  retryInfo: { attempt: number; maxRetries: number; delayMs: number; model: string } | null;
}>(() => ({
  submit: mockSubmit,
  submitting: false,
  error: null,
  attempts: [],
  retryInfo: null,
})));
vi.mock('@/features/quiz/useQuizAnswer', () => ({
  useQuizAnswer: mockUseQuizAnswer,
}));

// Mock all format components
vi.mock('@/features/quiz/formats/MultipleChoice', () => ({
  MultipleChoice: ({ onSubmit, disabled }: { onSubmit: (val: string) => void; disabled: boolean }) => (
    <button data-testid="mc-submit" disabled={disabled} onClick={() => onSubmit('A')}>
      MC Submit
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/TrueFalse', () => ({
  TrueFalse: ({ onSubmit, disabled }: { onSubmit: (val: string) => void; disabled: boolean }) => (
    <button data-testid="tf-submit" disabled={disabled} onClick={() => onSubmit('True')}>
      TF Submit
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/ShortAnswer', () => ({
  ShortAnswer: ({ onSubmit, disabled }: { onSubmit: (val: string) => void; disabled: boolean }) => (
    <button data-testid="sa-submit" disabled={disabled} onClick={() => onSubmit('answer')}>
      SA Submit
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/FreeText', () => ({
  FreeText: ({ onSubmit, disabled }: { onSubmit: (val: string) => void; disabled: boolean }) => (
    <button data-testid="ft-submit" disabled={disabled} onClick={() => onSubmit('free text')}>
      FT Submit
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/FillBlank', () => ({
  FillBlank: ({ onSubmit, disabled }: { onSubmit: (val: string) => void; disabled: boolean }) => (
    <button data-testid="fb-submit" disabled={disabled} onClick={() => onSubmit('filled')}>
      FB Submit
    </button>
  ),
}));

vi.mock('@/features/quiz/formats/Ordering', () => ({
  Ordering: ({ onSubmit, disabled }: { onSubmit: (val: string[]) => void; disabled: boolean }) => (
    <button data-testid="ord-submit" disabled={disabled} onClick={() => onSubmit(['A', 'B'])}>
      Ord Submit
    </button>
  ),
}));

const mockSettingsStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ persona: null, theme: 'auto' })),
}));
vi.mock('@/shared/stores/settingsStore', () => ({
  useSettingsStore: mockSettingsStore,
}));

function makeQuiz(overrides?: Partial<QuizData>): QuizData {
  return {
    kind: 'quiz',
    parentConceptId: 'c1',
    format: 'multipleChoice',
    prompt: 'What is 2+2?',
    options: ['3', '4', '5'],
    correctAnswer: '4',
    rationale: 'Basic arithmetic.',
    attempts: [],
    state: 'untested',
    ...overrides,
  };
}

function renderQuiz(quiz?: QuizData) {
  return render(
    <QuizInteraction
      quiz={quiz ?? makeQuiz()}
      quizId="q1"
      conceptTitle="Math"
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmit.mockReset();
  mockSubmit.mockResolvedValue({ grade: 'correct', rationale: '', idealAnswer: '' });
  mockUseQuizAnswer.mockReturnValue({
    submit: mockSubmit,
    submitting: false,
    error: null,
    attempts: [],
    retryInfo: null,
  });
  mockSettingsStore.getState.mockReturnValue({ persona: null, theme: 'auto' });
});

describe('QuizInteraction', () => {
  it('renders quiz prompt and format label', () => {
    renderQuiz();
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    expect(screen.getByText(/Multiple Choice/)).toBeInTheDocument();
    expect(screen.getByText(/\u00b7 Math/)).toBeInTheDocument();
  });

  it('renders MultipleChoice format component', () => {
    renderQuiz();
    expect(screen.getByTestId('mc-submit')).toBeInTheDocument();
  });

  it('renders TrueFalse format component', () => {
    renderQuiz(makeQuiz({ format: 'trueFalse' }));
    expect(screen.getByTestId('tf-submit')).toBeInTheDocument();
  });

  it('renders ShortAnswer format component', () => {
    renderQuiz(makeQuiz({ format: 'shortAnswer' }));
    expect(screen.getByTestId('sa-submit')).toBeInTheDocument();
  });

  it('renders FreeText format component', () => {
    renderQuiz(makeQuiz({ format: 'freeText' }));
    expect(screen.getByTestId('ft-submit')).toBeInTheDocument();
  });

  it('renders FillBlank format component', () => {
    renderQuiz(makeQuiz({ format: 'fillBlank', blankedSentence: 'The ___ is the powerhouse.' }));
    expect(screen.getByTestId('fb-submit')).toBeInTheDocument();
  });

  it('renders Ordering format component', () => {
    renderQuiz(makeQuiz({ format: 'ordering', items: ['A', 'B'] }));
    expect(screen.getByTestId('ord-submit')).toBeInTheDocument();
  });

  it('calls submit when format component submits', async () => {
    mockSubmit.mockResolvedValue({ grade: 'correct', rationale: 'Right!', idealAnswer: '4' });
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    expect(mockSubmit).toHaveBeenCalledWith('A');
  });

  it('shows result after successful submit', async () => {
    mockSubmit.mockResolvedValue({ grade: 'correct', rationale: 'Great job!', idealAnswer: '4' });
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Correct. Great job!');
      expect(screen.getByText('\u2713 Correct')).toBeInTheDocument();
      expect(screen.getByText('Great job!')).toBeInTheDocument();
    });
  });

  it('shows retry info when submitting and retryInfo is set', () => {
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: true,
      error: null,
      attempts: [],
      retryInfo: { attempt: 0, maxRetries: 2, delayMs: 1000, model: 'test' },
    });

    renderQuiz();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Grading timed out, retrying\u2026 (1/3)',
    );
  });

  it('shows "Gradingâ€¦" when submitting without retryInfo', () => {
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: true,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    expect(screen.getByRole('status')).toHaveTextContent('Grading\u2026');
  });

  it('shows error message', () => {
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: 'API error occurred',
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    expect(screen.getByRole('alert')).toHaveTextContent('API error occurred');
  });

  it('shows attempts list', () => {
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [
        { timestamp: 1, given: 'wrong', grade: 'incorrect' },
        { timestamp: 2, given: 'right', grade: 'correct' },
      ],
      retryInfo: null,
    });

    renderQuiz();
    expect(screen.getByText('Attempts (2)')).toBeInTheDocument();
    expect(screen.getByText('#1: incorrect')).toBeInTheDocument();
    expect(screen.getByText('#2: correct')).toBeInTheDocument();
  });

  it('shows Try once more button after submission', async () => {
    mockSubmit.mockResolvedValue({ grade: 'incorrect', rationale: 'Wrong.', idealAnswer: '4' });
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText('Try once more')).toBeInTheDocument();
    });
  });

  it('resets to unanswered state on Try once more', async () => {
    mockSubmit.mockResolvedValue({ grade: 'incorrect', rationale: 'Wrong.', idealAnswer: '4' });
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText('Try once more')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Try once more'));
    });

    // Should show the format component again
    expect(screen.getByTestId('mc-submit')).toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <QuizInteraction
        quiz={makeQuiz()}
        quizId="q1"
        conceptTitle="Math"
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when clicking overlay background', () => {
    const onClose = vi.fn();
    render(
      <QuizInteraction
        quiz={makeQuiz()}
        quizId="q1"
        conceptTitle="Math"
        onClose={onClose}
      />,
    );

    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the modal', async () => {
    const onClose = vi.fn();
    render(
      <QuizInteraction
        quiz={makeQuiz()}
        quizId="q1"
        conceptTitle="Math"
        onClose={onClose}
      />,
    );

    // Click inside the modal (the format component)
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows partial grade styling', async () => {
    mockSubmit.mockResolvedValue({ grade: 'partial', rationale: 'Close enough.', idealAnswer: '4' });
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Almost there. Close enough.');
      expect(screen.getByText('~ Almost there')).toBeInTheDocument();
    });
  });

  it('shows "Not quite" for incorrect grade', async () => {
    mockSubmit.mockResolvedValue({ grade: 'incorrect', rationale: 'Nope.', idealAnswer: '4' });
    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: null,
      attempts: [],
      retryInfo: null,
    });

    renderQuiz();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Not quite. Nope.');
      expect(screen.getByText('\u2717 Not quite')).toBeInTheDocument();
    });
  });

  it('keeps stable atomic live regions for status and errors', async () => {
    const view = renderQuiz();
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');

    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(alert).toHaveAttribute('aria-atomic', 'true');

    await act(async () => {
      fireEvent.click(screen.getByTestId('mc-submit'));
    });

    expect(screen.getByRole('status')).toBe(status);

    mockUseQuizAnswer.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: 'Grading failed',
      attempts: [],
      retryInfo: null,
    });
    view.rerender(
      <QuizInteraction
        quiz={makeQuiz()}
        quizId="q1"
        conceptTitle="Math"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBe(alert);
    expect(alert).toHaveTextContent('Grading failed');
  });
});
