import { useState, useCallback } from 'react';
import { chat } from '@/lib/llm/chat';
import { getGradingModel } from '@/lib/llm/providers';
import { buildGradeSystemPrompt, buildGradeUserMessage } from '@/lib/prompts/grade';
import { parseGradeResponse } from '@/lib/llm/gradeParser';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import type { QuizData, Attempt, QuizState } from '@/shared/types';

export interface SubmitResult {
  grade: 'correct' | 'partial' | 'incorrect';
  rationale: string;
  idealAnswer: string;
}

function localGrade(quiz: QuizData, given: string | string[]): SubmitResult {
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

function computeState(attempts: Attempt[]): QuizState {
  if (attempts.length === 0) return 'untested';
  const best = attempts.reduce((acc, a) => {
    const order = { correct: 2, partial: 1, incorrect: 0 } as const;
    return order[a.grade] > order[acc.grade] ? a : acc;
  }, attempts[0]);
  if (best.grade === 'correct') return 'correct';
  if (best.grade === 'partial') return 'inProgress';
  return 'incorrect';
}

export function useQuizAnswer(quiz: QuizData) {
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (given: string | string[], apiKey: string) => {
    const { provider } = useSettingsStore.getState();
    setSubmitting(true);
    setError(null);
    try {
      let result: SubmitResult;

      if (quiz.format === 'shortAnswer' || quiz.format === 'freeText') {
        try {
          const messages = [
            { role: 'system' as const, content: buildGradeSystemPrompt(quiz.parentConceptId) },
            { role: 'user' as const, content: buildGradeUserMessage(quiz.prompt, typeof given === 'string' ? given : JSON.stringify(given), quiz.correctAnswer) },
          ];
          const res = await chat(messages, { apiKey, provider, model: getGradingModel(provider) });
          const parsed = parseGradeResponse(res.content);
          result = parsed;
        } catch {
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

      const { updateCurrent, currentId, sessions: sessionList } = useSessionStore.getState();
      const session2 = sessionList.find(s => s.id === currentId);
      if (session2) {
        const nodeMatch = (n: typeof session2.nodes[0]) =>
          n.data.kind === 'quiz' &&
          (n.data as QuizData).parentConceptId === quiz.parentConceptId &&
          (n.data as QuizData).prompt === quiz.prompt &&
          (n.data as QuizData).format === quiz.format;
        const updatedNodes = session2.nodes.map(n => {
          if (nodeMatch(n)) {
            return { ...n, data: { ...n.data, attempts: updatedAttempts, state: newState } as QuizData };
          }
          return n;
        });
        await updateCurrent({ nodes: updatedNodes });
      }

      setLastResult(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Grading failed';
      setError(msg);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, [quiz]);

  const attempts = quiz.attempts;
  const state = computeState(attempts);

  return { submit, submitting, lastResult, error, attempts, state };
}
