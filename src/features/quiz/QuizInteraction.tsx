import { useState, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { QuizData } from '@/shared/types';
import { MultipleChoice } from './formats/MultipleChoice';
import { TrueFalse } from './formats/TrueFalse';
import { ShortAnswer } from './formats/ShortAnswer';
import { FreeText } from './formats/FreeText';
import { FillBlank } from './formats/FillBlank';
import { Ordering } from './formats/Ordering';
import type { SubmitResult } from './useQuizAnswer';
import { useQuizAnswer } from './useQuizAnswer';
import styles from './QuizInteraction.module.css';

const badgeClasses: Record<string, string> = {
  inProgress: styles.badgeInProgress,
  correct: styles.badgeCorrect,
  partial: styles.badgePartial,
  incorrect: styles.badgeIncorrect,
  mastered: styles.badgeMastered,
};

interface Props {
  quiz: QuizData;
  quizId: string;
  conceptTitle: string;
  onClose: () => void;
  notebookMode?: boolean;
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

    // Save previous focus
    prevFocusRef.current = document.activeElement as HTMLElement;

    // Auto-focus target element or first focusable element
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
      // Restore focus to previously active element
      prevFocusRef.current?.focus();
    };
  }, [containerRef, autoFocusSelector]);
}

export function QuizInteraction({ quiz, quizId, conceptTitle, onClose, notebookMode }: Props) {
  const { submit, submitting, error, attempts, retryInfo } = useQuizAnswer(quiz, quizId);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showRemediation, setShowRemediation] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const promptId = 'quiz-prompt-' + quizId;

  useFocusTrap(overlayRef, '[data-quiz-close]');

  const handleSubmit = useCallback(
    async (answer: string | string[]) => {
      const res = await submit(answer);
      setResult(res);
      setSubmitted(true);
      if (res.grade === 'incorrect' || res.grade === 'partial') {
        setShowRemediation(true);
      }
    },
    [submit],
  );

  const handleTryOnceMore = useCallback(() => {
    setShowRemediation(false);
    setSubmitted(false);
    setResult(null);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatLabel = quiz.format
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  const gradingMessage = retryInfo
    ? `Grading timed out, retrying… (${retryInfo.attempt + 1}/${retryInfo.maxRetries + 1})`
    : 'Grading…';
  const resultMessage = result
    ? `${result.grade === 'correct' ? 'Correct' : result.grade === 'partial' ? 'Almost there' : 'Not quite'}. ${result.rationale}`
    : '';
  const statusMessage = submitting ? gradingMessage : resultMessage;

  return (
    <div
      ref={overlayRef}
      className={`${styles.overlay} ${notebookMode ? styles.notebookOverlay : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={promptId}
      onClick={
        notebookMode
          ? undefined
          : (e) => {
              if (e.target === overlayRef.current) onClose();
            }
      }
    >
      <div className={`${styles.dialog} ${notebookMode ? styles.notebookDialog : ''}`}>
        <div className={styles.header}>
          <div>
            <div className={styles.metadata}>
              {formatLabel} &middot; {conceptTitle}
            </div>
            <div id={promptId} className={styles.prompt}>
              {quiz.prompt}
            </div>
          </div>
          <button
            onClick={onClose}
            className={styles.closeButton}
            data-quiz-close
            aria-label="Close quiz"
          >
            ✕
          </button>
        </div>

        <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
          {statusMessage}
        </div>
        <div className={styles.srOnly} role="alert" aria-live="assertive" aria-atomic="true">
          {error ?? ''}
        </div>

        {!submitted ? (
          <div>
            {quiz.format === 'multipleChoice' && (
              <MultipleChoice
                options={quiz.options ?? []}
                disabled={submitting}
                onSubmit={handleSubmit}
              />
            )}
            {quiz.format === 'trueFalse' && (
              <TrueFalse disabled={submitting} onSubmit={handleSubmit} />
            )}
            {quiz.format === 'shortAnswer' && (
              <ShortAnswer disabled={submitting} onSubmit={handleSubmit} />
            )}
            {quiz.format === 'freeText' && (
              <FreeText disabled={submitting} onSubmit={handleSubmit} />
            )}
            {quiz.format === 'fillBlank' && (
              <FillBlank
                blankedSentence={quiz.blankedSentence ?? ''}
                disabled={submitting}
                onSubmit={handleSubmit}
              />
            )}
            {quiz.format === 'ordering' && (
              <Ordering items={quiz.items ?? []} disabled={submitting} onSubmit={handleSubmit} />
            )}
            {submitting && <div className={styles.grading}>{gradingMessage}</div>}
          </div>
        ) : result && showRemediation && result.grade !== 'correct' ? (
          <div>
            <div
              className={`${styles.feedback} ${
                result.grade === 'partial' ? styles.partial : styles.incorrect
              }`}
            >
              <div className={`${styles.feedbackTitle} ${styles.remediationTitle}`}>
                {result.grade === 'partial' ? '~ Almost there' : '\u2717 Not quite'}
              </div>
              <div className={styles.feedbackBody}>
                <div className={styles.sectionHeading}>What to notice</div>
                <div className={styles.rationale}>{result.rationale}</div>
                <div className={styles.sectionHeading}>The correct answer</div>
                <div className={styles.correctAnswer}>{quiz.correctAnswer}</div>
              </div>
            </div>
            <button onClick={handleTryOnceMore} className={styles.primaryButton}>
              Try once more
            </button>
          </div>
        ) : result ? (
          <div className={styles.result}>
            {result.grade === 'correct' && <ConfettiExplosion />}
            <div
              className={`${styles.feedback} ${
                result.grade === 'correct' ? styles.correct : styles.partial
              }`}
            >
              <div className={styles.feedbackTitle}>
                {result.grade === 'correct' ? '\u2713 Correct' : '~ Partial'}
              </div>
              <div className={styles.feedbackBody}>{result.rationale}</div>
            </div>
          </div>
        ) : null}

        {error && (
          <div className={styles.error} role="alert" aria-live="polite">
            <strong>Grading failed.</strong>
            <div>{error}</div>
            <div>Adjust the answer and submit again.</div>
          </div>
        )}

        {attempts.length > 0 && (
          <div className={styles.attempts}>
            <div className={styles.attemptsTitle}>Attempts ({attempts.length})</div>
            {attempts.map((a, i) => (
              <div key={i} className={styles.attempt}>
                <span
                  className={`${styles.badge} ${badgeClasses[a.grade] ?? ''}`}
                  aria-hidden="true"
                />
                #{i + 1}: {a.grade}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfettiExplosion() {
  const particles = Array.from({ length: 45 });
  return (
    <div className={styles.confettiContainer} aria-hidden="true">
      {particles.map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 30 + Math.random() * 110;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        const delay = Math.random() * 0.15;
        const size = 5 + Math.random() * 6;
        const colors = [
          '#5457E8',
          '#2E9E5B',
          '#D9A441',
          '#D14B4B',
          '#9b5de5',
          '#f15bb5',
          '#00f5d4',
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return (
          <span
            key={i}
            className={styles.confettiParticle}
            style={
              {
                '--confetti-x': tx + 'px',
                '--confetti-y': ty + 'px',
                '--confetti-color': color,
                width: size + 'px',
                height: size + 'px',
                animationDelay: delay + 's',
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
