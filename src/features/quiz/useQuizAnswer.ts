import { useState, useCallback } from 'react';
import { executePromptTask } from '@/lib/llm/promptTask';
import { gradeTask } from '@/lib/tasks/gradeTask';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useToastStore } from '@/shared/stores/toastStore';
import { debugLog } from '@/lib/debug';
import * as sessionsDb from '@/lib/db/sessionsDb';
import type { QuizData, Attempt, QuizState } from '@/shared/types';
import { computeNextReviewAt } from '@/shared/learningProgress';

export interface SubmitResult {
  grade: 'correct' | 'partial' | 'incorrect';
  rationale: string;
  idealAnswer: string;
}

export function localGrade(quiz: QuizData, given: string | string[]): SubmitResult {
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

  const submit = useCallback(async (given: string | string[]) => {
    setSubmitting(true);
    setError(null);
    setRetryInfo(null);
    try {
      let result: SubmitResult;

      if (quiz.format === 'shortAnswer' || quiz.format === 'freeText') {
        debugLog('log', 'grade', 'LLM grade start format=%s quiz_id=%s', quiz.format, quizId);
        try {
          result = await executePromptTask(gradeTask, {
            persona: 'curious', signal: undefined,
            context: { conceptTitle: quiz.parentConceptId },
            onRetry: (info) => {
              setRetryInfo({ attempt: info.attempt, maxRetries: info.maxRetries });
              useToastStore.getState().add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`);
            },
          }, {
            prompt: quiz.prompt,
            given: typeof given === 'string' ? given : JSON.stringify(given),
            correctAnswer: quiz.correctAnswer,
          });
          debugLog('log', 'grade', 'LLM grade result grade=%s quiz_id=%s', result.grade, quizId);
        } catch {
          setRetryInfo(null);
          debugLog('warn', 'grade', 'LLM grade FAIL fallback_to_fuzzy quiz_id=%s', quizId);
          const givenStr = typeof given === 'string' ? given.trim().toLowerCase() : given.join(' ').toLowerCase();
          const ideal = quiz.correctAnswer.trim().toLowerCase();
          const fuzzyCorrect = givenStr === ideal || ideal.includes(givenStr) || givenStr.includes(ideal);
          result = {
            grade: fuzzyCorrect ? 'correct' : 'incorrect',
            rationale: fuzzyCorrect ? quiz.rationale : `Couldn't reach grader. Expected something like "${quiz.correctAnswer}".`,
            idealAnswer: quiz.correctAnswer,
          };
        }
      } else {
        result = localGrade(quiz, given);
        debugLog('log', 'grade', 'local grade format=%s grade=%s', quiz.format, result.grade);
      }

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
          const quizIndex = authoritative.nodes.findIndex(n => n.id === quizId && n.data?.kind === 'quiz');
          if (quizIndex !== -1) {
            const updatedNodes = [...authoritative.nodes];
            updatedNodes[quizIndex] = {
              ...updatedNodes[quizIndex],
              data: { ...updatedNodes[quizIndex].data, attempts: updatedAttempts, state: newState } as QuizData,
            };

            const conceptId = quiz.parentConceptId;
            const siblingQuizzes = updatedNodes.filter(
              n => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === conceptId,
            );
            const allComplete = siblingQuizzes.every(n => {
              const q = n.data as QuizData;
              return q.state === 'correct' || q.state === 'mastered';
            });

            const prevCompleted = authoritative.completedConceptIds ?? [];
            const completedConceptIds = allComplete && !prevCompleted.includes(conceptId)
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
            debugLog('log', 'grade', 'grade persist session=%s node=%s state=%s attempts=%d conceptComplete=%s', currentId, quizId, newState, updatedAttempts.length, allComplete ? conceptId : 'no');
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
  }, [quiz, quizId]);

  const attempts = quiz.attempts;
  const state = computeState(attempts);

  return { submit, submitting, lastResult, error, attempts, state, retryInfo };
}
