import { debugLog } from '@/lib/debug';
import { executePromptTask } from '@/lib/llm/promptTask';
import { gradeTask } from '@/lib/tasks/gradeTask';
import type { QuizData } from '@/shared/types';

export interface SubmitResult {
  grade: 'correct' | 'partial' | 'incorrect';
  rationale: string;
  idealAnswer: string;
}

interface GradeQuizAnswerOptions {
  conceptTitle?: string;
  quizId?: string;
  onRetry?: (info: { attempt: number; maxRetries: number }) => void;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function localGrade(quiz: QuizData, given: string | string[]): SubmitResult {
  switch (quiz.format) {
    case 'multipleChoice':
    case 'trueFalse': {
      const correct =
        typeof given === 'string' && normalize(given) === normalize(quiz.correctAnswer);
      return {
        grade: correct ? 'correct' : 'incorrect',
        rationale: correct
          ? quiz.rationale
          : `The correct answer is: ${quiz.correctAnswer}. ${quiz.rationale}`,
        idealAnswer: quiz.correctAnswer,
      };
    }
    case 'fillBlank': {
      const givenStr = typeof given === 'string' ? normalize(given) : '';
      const acceptable = (quiz.acceptableAnswers ?? []).map(normalize).filter(Boolean);
      const matchesAny =
        givenStr.length > 0 &&
        acceptable.some((answer) => givenStr.includes(answer) || answer.includes(givenStr));
      const matchesCorrect = givenStr.length > 0 && givenStr === normalize(quiz.correctAnswer);
      const correct = matchesCorrect || matchesAny;
      return {
        grade: correct ? 'correct' : 'incorrect',
        rationale: correct
          ? quiz.rationale
          : `Expected something like "${quiz.correctAnswer}". ${quiz.rationale}`,
        idealAnswer: quiz.correctAnswer,
      };
    }
    case 'ordering': {
      const givenArr = Array.isArray(given) ? given : [];
      const expected = quiz.items ?? [];
      if (givenArr.length !== expected.length) {
        return {
          grade: 'incorrect',
          rationale: 'The order is incorrect.',
          idealAnswer: expected.join(', '),
        };
      }
      const correct = givenArr.every(
        (item, index) => normalize(item) === normalize(expected[index]),
      );
      return {
        grade: correct ? 'correct' : 'partial',
        rationale: correct
          ? quiz.rationale
          : `The expected order is: ${expected.join(' → ')}. ${quiz.rationale}`,
        idealAnswer: expected.join(', '),
      };
    }
    default:
      return {
        grade: 'incorrect',
        rationale: 'Cannot grade this format locally.',
        idealAnswer: quiz.correctAnswer,
      };
  }
}

export async function gradeQuizAnswer(
  quiz: QuizData,
  given: string | string[],
  options: GradeQuizAnswerOptions = {},
): Promise<SubmitResult> {
  if (quiz.format !== 'shortAnswer' && quiz.format !== 'freeText') {
    const result = localGrade(quiz, given);
    debugLog('log', 'grade', 'local grade format=%s grade=%s', quiz.format, result.grade);
    return result;
  }

  const quizId = options.quizId ?? 'summary';
  debugLog('log', 'grade', 'LLM grade start format=%s quiz_id=%s', quiz.format, quizId);
  try {
    const result = await executePromptTask(
      gradeTask,
      {
        persona: 'curious',
        signal: undefined,
        context: { conceptTitle: options.conceptTitle ?? quiz.parentConceptId },
        onRetry: options.onRetry,
      },
      {
        prompt: quiz.prompt,
        given: typeof given === 'string' ? given : JSON.stringify(given),
        correctAnswer: quiz.correctAnswer,
      },
    );
    debugLog('log', 'grade', 'LLM grade result grade=%s quiz_id=%s', result.grade, quizId);
    return result;
  } catch {
    debugLog('warn', 'grade', 'LLM grade FAIL fallback_to_fuzzy quiz_id=%s', quizId);
    const givenStr = normalize(typeof given === 'string' ? given : given.join(' '));
    const ideal = normalize(quiz.correctAnswer);
    const fuzzyCorrect =
      givenStr.length > 0 &&
      (givenStr === ideal || ideal.includes(givenStr) || givenStr.includes(ideal));
    return {
      grade: fuzzyCorrect ? 'correct' : 'incorrect',
      rationale: fuzzyCorrect
        ? quiz.rationale
        : `Couldn't reach grader. Expected something like "${quiz.correctAnswer}".`,
      idealAnswer: quiz.correctAnswer,
    };
  }
}
