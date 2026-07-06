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
import { useSettingsStore } from '@/shared/stores/settingsStore';

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

export function QuizInteraction({ quiz, quizId, conceptTitle, onClose }: Props) {
  const { submit, submitting, error, attempts } = useQuizAnswer(quiz, quizId);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(async (answer: string | string[]) => {
    const key = useSettingsStore.getState().apiKey;
    if (!key) return;
    const res = await submit(answer, key);
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
            <div style={{
              fontSize: 15, fontWeight: 500, color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)', lineHeight: 1.4,
            }}>
              {quiz.prompt}
            </div>
          </div>
          <button onClick={onClose} style={{
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
                Grading…
              </div>
            )}
          </div>
        ) : result ? (
          <div>
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12,
              background: result.grade === 'correct'
                ? 'rgba(34,197,94,0.1)'
                : result.grade === 'partial'
                ? 'rgba(234,179,8,0.1)'
                : 'rgba(239,68,68,0.1)',
              border: `1px solid ${
                result.grade === 'correct' ? '#22c55e'
                : result.grade === 'partial' ? '#eab308'
                : '#ef4444'
              }`,
            }}>
              <div style={{
                fontWeight: 600, fontSize: 14, marginBottom: 4,
                color: result.grade === 'correct' ? '#22c55e'
                  : result.grade === 'partial' ? '#eab308'
                  : '#ef4444',
                fontFamily: 'var(--font-ui)',
              }}>
                {result.grade === 'correct' ? '✓ Correct'
                  : result.grade === 'partial' ? '~ Partial'
                  : '✗ Incorrect'}
              </div>
              <div style={{
                fontSize: 13, color: 'var(--text-primary)',
                fontFamily: 'var(--font-ui)', lineHeight: 1.5,
              }}>
                {result.rationale}
              </div>
            </div>
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
