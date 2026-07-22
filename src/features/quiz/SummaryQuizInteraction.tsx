import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import styles from './SummaryQuizInteraction.module.css';
import type { QuizData } from '@/shared/types';
import { MultipleChoice } from './formats/MultipleChoice';
import { TrueFalse } from './formats/TrueFalse';
import { ShortAnswer } from './formats/ShortAnswer';
import { FreeText } from './formats/FreeText';
import { FillBlank } from './formats/FillBlank';
import { Ordering } from './formats/Ordering';
import { gradeQuizAnswer } from './quizGrading';

interface Props {
  quizData: QuizData[];
  onClose: () => void;
  onRetake: () => void;
  initialScores: Record<string, { best: number; attempts: number }>;
  onUpdateScores: (scores: Record<string, { best: number; attempts: number }>) => void;
}

/** Focus trap hook: keeps focus within the dialog and auto-focuses a target element on mount */
function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  autoFocusSelector?: string,
) {
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    prevFocusRef.current = document.activeElement as HTMLElement;

    const target = autoFocusSelector
      ? container.querySelector<HTMLElement>(autoFocusSelector)
      : null;
    if (target) {
      target.focus();
    } else {
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) focusable[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      prevFocusRef.current?.focus();
    };
  }, [containerRef, autoFocusSelector]);
}

function parseScores(
  scores: Record<string, { best: number; attempts: number }>,
): Record<number, boolean> {
  return Object.fromEntries(
    Object.entries(scores).map(([index, score]) => [Number(index), score.best === 1]),
  );
}

export function SummaryQuizInteraction({
  quizData,
  onClose,
  onRetake,
  initialScores,
  onUpdateScores,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<Record<number, boolean>>(() => parseScores(initialScores));
  const [, setCumulativeScores] = useState(initialScores);
  const [showResults, setShowResults] = useState(false);
  const [grading, setGrading] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const current = quizData[currentIndex];
  const total = quizData.length;
  const done = Object.keys(results).length;

  useFocusTrap(overlayRef, showResults ? '.summary-close-btn' : '.summary-first-focus');

  const handleAnswer = useCallback(
    (correct: boolean) => {
      setResults((prev) => {
        const next = { ...prev };
        next[currentIndex] = correct;
        return next;
      });
      setCumulativeScores((prev) => {
        const key = String(currentIndex);
        const previous = prev[key] ?? { best: 0, attempts: 0 };
        const next = {
          ...prev,
          [key]: {
            best: Math.max(previous.best, correct ? 1 : 0),
            attempts: previous.attempts + 1,
          },
        };
        onUpdateScores(next);
        return next;
      });
    },
    [currentIndex, onUpdateScores],
  );

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, total]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const finishQuiz = useCallback(() => {
    setShowResults(true);
  }, []);

  const masteryPct = useMemo(() => {
    if (total === 0) return 0;
    return Math.round((Object.values(results).filter(Boolean).length / total) * 100);
  }, [results, total]);

  const retakeAll = useCallback(() => {
    setResults({});
    setCurrentIndex(0);
    setShowResults(false);
    setAnnouncement('Assessment reset. Question 1 of ' + total + '.');
    onRetake();
  }, [onRetake, total]);

  if (showResults) {
    const correct = Object.values(results).filter(Boolean).length;
    const incorrect = Object.values(results).filter((result) => !result).length;
    const unattempted = total - done;

    return (
      <div
        className={styles.overlay}
        onClick={onClose}
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="Summary quiz results"
      >
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.resultsPanel} role="status" aria-live="polite" aria-atomic="true">
            <div className={styles.masteryPct}>{masteryPct}%</div>
            <div className={styles.masteryLabel}>Mastery</div>
            <div className={styles.breakdown}>
              <div>
                <div className={styles.breakdownGreen}>{correct}</div>
                <div className={styles.breakdownLabel}>Correct</div>
              </div>
              <div>
                <div className={styles.breakdownYellow}>{unattempted}</div>
                <div className={styles.breakdownLabel}>Unanswered</div>
              </div>
              <div>
                <div className={styles.breakdownRed}>{incorrect}</div>
                <div className={styles.breakdownLabel}>Incorrect</div>
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryBtn} onClick={retakeAll}>
                Retake All
              </button>
              <button
                className={[styles.secondaryBtn, 'summary-close-btn'].join(' ')}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const answered = results[currentIndex] !== undefined;

  const submitAnswer = async (answer: string | string[]) => {
    setGrading(true);
    setAnnouncement('Grading answer.');
    try {
      const result = await gradeQuizAnswer(current, answer, {
        conceptTitle: current.parentConceptId,
        quizId: `summary-${currentIndex}`,
      });
      const correct = result.grade === 'correct';
      handleAnswer(correct);
      setAnnouncement(correct ? 'Answer correct.' : 'Answer not correct.');
    } finally {
      setGrading(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={'Summary quiz: ' + current.prompt}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={[styles.questionCounter, 'summary-first-focus'].join(' ')} tabIndex={-1}>
          Question {currentIndex + 1} of {total}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
        <div className={styles.prompt}>{current.prompt}</div>

        {current.format === 'multipleChoice' && (
          <MultipleChoice
            options={current.options ?? []}
            disabled={answered || grading}
            onSubmit={submitAnswer}
          />
        )}
        {current.format === 'trueFalse' && (
          <TrueFalse disabled={answered || grading} onSubmit={submitAnswer} />
        )}
        {current.format === 'shortAnswer' && (
          <ShortAnswer disabled={answered || grading} onSubmit={submitAnswer} />
        )}
        {current.format === 'freeText' && (
          <FreeText disabled={answered || grading} onSubmit={submitAnswer} />
        )}
        {current.format === 'fillBlank' && (
          <FillBlank
            blankedSentence={current.blankedSentence ?? ''}
            disabled={answered || grading}
            onSubmit={submitAnswer}
          />
        )}
        {current.format === 'ordering' && (
          <Ordering
            items={current.items ?? []}
            disabled={answered || grading}
            onSubmit={submitAnswer}
          />
        )}

        <div className={styles.nav}>
          <button className={styles.navBtn} onClick={goPrev} disabled={currentIndex === 0}>
            &larr; Previous
          </button>
          <span
            style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}
          >
            {done} of {total} answered
          </span>
          {currentIndex < total - 1 ? (
            <button className={styles.navBtn} onClick={goNext} disabled={answered !== true}>
              Next &rarr;
            </button>
          ) : (
            <button
              className={[styles.navBtn, 'summary-first-focus'].join(' ')}
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              onClick={finishQuiz}
              disabled={!answered || grading || done < total}
            >
              Show Results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
