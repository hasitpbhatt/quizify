import { useState, useCallback } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useToastStore } from '@/shared/stores/toastStore';
import { debugLog } from '@/lib/debug';
import * as sessionsDb from '@/lib/db/sessionsDb';
import type { QuizData, Attempt, QuizState } from '@/shared/types';
import { computeNextReviewAt } from '@/shared/learningProgress';
import { gradeQuizAnswer } from './quizGrading';
import type { SubmitResult } from './quizGrading';

export { localGrade } from './quizGrading';
export type { SubmitResult } from './quizGrading';

export function computeState(attempts: Attempt[]): QuizState {
  if (attempts.length === 0) return 'untested';
  const best = attempts.reduce((acc, a) => {
    const order = { correct: 2, partial: 1, incorrect: 0 } as const;
    return order[a.grade] > order[acc.grade] ? a : acc;
  }, attempts[0]);
  if (best.grade === 'correct') return 'correct';
  if (best.grade === 'partial') return 'inProgress';
  return 'incorrect';
}

export function useQuizAnswer(quiz: QuizData, quizId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<{ attempt: number; maxRetries: number } | null>(null);

  const submit = useCallback(
    async (given: string | string[]) => {
      setSubmitting(true);
      setError(null);
      setRetryInfo(null);
      try {
        const result: SubmitResult = await gradeQuizAnswer(quiz, given, {
          quizId,
          onRetry: (info) => {
            setRetryInfo({ attempt: info.attempt, maxRetries: info.maxRetries });
            useToastStore
              .getState()
              .add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`);
          },
        });

        const attempt: Attempt = {
          timestamp: Date.now(),
          given: given,
          grade: result.grade,
          rationale: result.rationale,
          idealAnswer: result.idealAnswer,
        };

        const updatedAttempts = [...quiz.attempts, attempt];
        const newState = computeState(updatedAttempts);

        const { currentId, updateCurrent } = useSessionStore.getState();
        if (currentId) {
          const authoritative = await sessionsDb.getSession(currentId);
          if (authoritative) {
            const quizIndex = authoritative.nodes.findIndex(
              (n) => n.id === quizId && n.data?.kind === 'quiz',
            );
            if (quizIndex !== -1) {
              const updatedNodes = [...authoritative.nodes];
              updatedNodes[quizIndex] = {
                ...updatedNodes[quizIndex],
                data: {
                  ...updatedNodes[quizIndex].data,
                  attempts: updatedAttempts,
                  state: newState,
                } as QuizData,
              };

              const conceptId = quiz.parentConceptId;
              const siblingQuizzes = updatedNodes.filter(
                (n) => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === conceptId,
              );
              const allComplete = siblingQuizzes.every((n) => {
                const q = n.data as QuizData;
                return q.state === 'correct' || q.state === 'mastered';
              });

              const prevCompleted = authoritative.completedConceptIds ?? [];
              const completedConceptIds =
                allComplete && !prevCompleted.includes(conceptId)
                  ? [...prevCompleted, conceptId]
                  : prevCompleted;

              const nextReviewAtByConceptId = {
                ...(authoritative.nextReviewAtByConceptId ?? {}),
                [conceptId]: computeNextReviewAt(newState),
              };

              await updateCurrent({
                nodes: updatedNodes,
                lastConceptId: conceptId,
                completedConceptIds,
                nextReviewAtByConceptId,
                lastActivityAt: Date.now(),
              });
              debugLog(
                'log',
                'grade',
                'grade persist session=%s node=%s state=%s attempts=%d conceptComplete=%s',
                currentId,
                quizId,
                newState,
                updatedAttempts.length,
                allComplete ? conceptId : 'no',
              );
            }
          }
        }

        setRetryInfo(null);
        setLastResult(result);
        return result;
      } catch (err) {
        setRetryInfo(null);
        const msg = err instanceof Error ? err.message : 'Grading failed';
        setError(msg);
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [quiz, quizId],
  );

  const attempts = quiz.attempts;
  const state = computeState(attempts);

  return { submit, submitting, lastResult, error, attempts, state, retryInfo };
}
