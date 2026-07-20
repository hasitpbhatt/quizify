import { useState, useCallback, useEffect, useRef } from 'react';
import type { QuizData } from '@/shared/types';
import { MultipleChoice } from './formats/MultipleChoice';
import { TrueFalse } from './formats/TrueFalse';
import { ShortAnswer } from './formats/ShortAnswer';
import { FreeText } from './formats/FreeText';
import { FillBlank } from './formats/FillBlank';
import { Ordering } from './formats/Ordering';
import type { SubmitResult } from './useQuizAnswer';
import { useQuizAnswer } from './useQuizAnswer';
import { useSessionStore } from '@/shared/stores/sessionStore';
import * as sessionsDb from '@/lib/db/sessionsDb';

interface Props {
  quiz: QuizData;
  quizId: string;
  conceptTitle: string;
  onClose: () => void;
}

const badgeColors: Record<string, string> = {
  untested: 'var(--text-secondary)',
  inProgress: '#eab308',
  correct: '#22c55e',
  incorrect: '#ef4444',
  mastered: '#22c55e',
};

/** Focus trap hook: keeps focus within the dialog and auto-focuses a target element on mount */
function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, autoFocusSelector?: string) {
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

export function QuizInteraction({ quiz, quizId, conceptTitle, onClose }: Props) {
  const { submit, submitting, error, attempts, retryInfo } = useQuizAnswer(quiz, quizId);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const promptId = 'quiz-prompt-' + quizId;

  useFocusTrap(overlayRef, '.quiz-close-btn');

  const handleResetQuiz = useCallback(async () => {
    const { currentId, updateCurrent } = useSessionStore.getState();
    if (!currentId) return;
    const authoritative = await sessionsDb.getSession(currentId);
    if (!authoritative) return;
    const quizIndex = authoritative.nodes.findIndex(n => n.id === quizId && n.data?.kind === 'quiz');
    if (quizIndex === -1) return;
    const updatedNodes = [...authoritative.nodes];
    updatedNodes[quizIndex] = {
      ...updatedNodes[quizIndex],
      data: { ...updatedNodes[quizIndex].data, attempts: [], state: 'untested', bestScore: undefined } as QuizData,
    };
    await updateCurrent({ nodes: updatedNodes });
    setSubmitted(false);
    setResult(null);
  }, [quizId]);

  const handleSubmit = useCallback(async (answer: string | string[]) => {
    const res = await submit(answer);
    setResult(res);
    setSubmitted(true);
  }, [submit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatLabel = quiz.format
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={promptId}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        background: 'var(--bg-canvas)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, maxWidth: 520, width: '90%',
        maxHeight: '80vh', overflow: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 16,
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: 0.5, color: 'var(--accent)',
              fontFamily: 'var(--font-ui)', marginBottom: 4,
            }}>
              {formatLabel} &middot; {conceptTitle}
            </div>
            <div
              id={promptId}
              style={{
                fontSize: 15, fontWeight: 500, color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)', lineHeight: 1.4,
              }}
            >
              {quiz.prompt}
            </div>
          </div>
          <button onClick={onClose} className="quiz-close-btn" aria-label="Close quiz" style={{
            padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12,
          }}>
            ✕
          </button>
        </div>

        {!submitted ? (
          <div>
            {quiz.format === 'multipleChoice' && (
              <MultipleChoice options={quiz.options ?? []} disabled={submitting} onSubmit={handleSubmit} />
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
              <FillBlank blankedSentence={quiz.blankedSentence ?? ''} disabled={submitting} onSubmit={handleSubmit} />
            )}
            {quiz.format === 'ordering' && (
              <Ordering items={quiz.items ?? []} disabled={submitting} onSubmit={handleSubmit} />
            )}
            {submitting && (
              <div style={{
                textAlign: 'center', padding: 16,
                color: 'var(--text-secondary)', fontSize: 13,
              }}>
                {retryInfo
                  ? 'Grading timed out, retrying\u2026 (' + (retryInfo.attempt + 1) + '/' + (retryInfo.maxRetries + 1) + ')'
                  : 'Grading\u2026'}
              </div>
            )}
          </div>
        ) : result ? (
          <div style={{ position: 'relative' }}>
            {result.grade === 'correct' && <ConfettiExplosion />}
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12,
              background: result.grade === 'correct'
                ? 'rgba(34,197,94,0.1)'
                : result.grade === 'partial'
                ? 'rgba(234,179,8,0.1)'
                : 'rgba(239,68,68,0.1)',
              border: result.grade === 'correct'
                ? '1px solid #22c55e'
                : result.grade === 'partial'
                ? '1px solid #eab308'
                : '1px solid #ef4444',
            }}>
              <div style={{
                fontWeight: 600, fontSize: 14, marginBottom: 4,
                color: result.grade === 'correct' ? '#22c55e'
                  : result.grade === 'partial' ? '#eab308'
                  : '#ef4444',
                fontFamily: 'var(--font-ui)',
              }}>
                {result.grade === 'correct' ? '\u2713 Correct'
                  : result.grade === 'partial' ? '~ Partial'
                  : '\u2717 Incorrect'}
              </div>
              <div style={{
                fontSize: 13, color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)', lineHeight: 1.5,
              }}>
                {result.rationale}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => { setSubmitted(false); setResult(null); }}
                style={{
                  padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                  cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13,
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  handleResetQuiz();
                }}
                style={{
                  padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-secondary)',
                  cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13,
                }}
              >
                Reset quiz
              </button>
            </div>
          </div>
        ) : null}

        {error && (
          <div style={{
            padding: 8, borderRadius: 6, marginTop: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444',
            color: '#ef4444', fontSize: 12, fontFamily: 'var(--font-ui)',
          }}>
            {error}
          </div>
        )}

        {attempts.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
              marginBottom: 8, fontFamily: 'var(--font-ui)',
            }}>
              Attempts ({attempts.length})
            </div>
            {attempts.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, color: 'var(--text-secondary)',
                fontFamily: 'var(--font-ui)', marginBottom: 4,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: badgeColors[a.grade],
                  display: 'inline-block',
                }} />
                #{i + 1}: {a.grade}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CONFETTI_STYLE = `
@keyframes explode {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity: 0; }
}
.confetti-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 1000;
}
.confetti-particle {
  position: absolute;
  border-radius: 50%;
  background: var(--bg);
  animation: explode 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
`;

function ConfettiExplosion() {
  const particles = Array.from({ length: 45 });
  return (
    <div className="confetti-container">
      <style>{CONFETTI_STYLE}</style>
      {particles.map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 30 + Math.random() * 110;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        const delay = Math.random() * 0.15;
        const size = 5 + Math.random() * 6;
        const colors = ['#5457E8', '#2E9E5B', '#D9A441', '#D14B4B', '#9b5de5', '#f15bb5', '#00f5d4'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return (
          <span
            key={i}
            className="confetti-particle"
            style={{
              '--tx': tx + 'px',
              '--ty': ty + 'px',
              '--bg': color,
              width: size + 'px',
              height: size + 'px',
              animationDelay: delay + 's',
            } as any}
          />
        );
      })}
    </div>
  );
}
