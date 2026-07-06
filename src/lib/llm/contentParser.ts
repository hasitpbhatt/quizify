import { ParseError } from './errors';
import { extractBalanced } from './extractBalanced';
import type { QuizFormat } from '@/shared/types';

export interface QuizItem {
  format: QuizFormat;
  prompt: string;
  options: string[] | null;
  blankedSentence: string | null;
  items: string[] | null;
  correctAnswer: string;
  acceptableAnswers: string[] | null;
  rationale: string;
}

const VALID_FORMATS: QuizFormat[] = [
  'multipleChoice', 'trueFalse', 'shortAnswer', 'freeText', 'fillBlank', 'ordering',
];

export interface ConceptDetailContent {
  explanation: string;
  example: string;
}

export interface ContentResponse {
  detail: ConceptDetailContent;
  quizzes: QuizItem[];
}

export function parseContentResponse(raw: string): ContentResponse {
  let parsed: unknown;

  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    try { parsed = JSON.parse(match[1]); } catch {}
  }

  if (!parsed) {
    try { parsed = JSON.parse(raw); } catch {}
  }

  if (!parsed) {
    let startIdx = 0;
    while ((startIdx = raw.indexOf('{', startIdx)) !== -1) {
      const extracted = extractBalanced(raw.slice(startIdx), '{', '}');
      if (extracted) {
        try {
          const p = JSON.parse(extracted);
          if (p && typeof p === 'object' && !Array.isArray(p)) {
            parsed = p;
            break;
          }
        } catch {}
      }
      startIdx++;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ParseError('Could not extract valid JSON from content response');
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.detail || typeof obj.detail !== 'object') {
    throw new ParseError('Missing or invalid "detail" object');
  }
  const detailObj = obj.detail as Record<string, unknown>;
  if (typeof detailObj.explanation !== 'string') throw new ParseError('Missing "detail.explanation"');
  if (typeof detailObj.example !== 'string') throw new ParseError('Missing "detail.example"');

  if (!Array.isArray(obj.quizzes) || obj.quizzes.length === 0) {
    throw new ParseError('Missing or empty "quizzes" array');
  }

  const quizzes = obj.quizzes
    .map((item: unknown, j: number) => {
      try {
        if (!item || typeof item !== 'object') throw new Error(`Quiz ${j} is not an object`);
        const quiz = item as Record<string, unknown>;
        if (!VALID_FORMATS.includes(quiz.format as QuizFormat)) {
          throw new Error(`Quiz ${j}: invalid format "${String(quiz.format)}"`);
        }
        if (typeof quiz.prompt !== 'string') throw new Error(`Quiz ${j}: missing or invalid "prompt"`);
        if (typeof quiz.correctAnswer !== 'string') throw new Error(`Quiz ${j}: missing or invalid "correctAnswer"`);
        if (typeof quiz.rationale !== 'string') throw new Error(`Quiz ${j}: missing or invalid "rationale"`);

        return {
          format: quiz.format as QuizFormat,
          prompt: quiz.prompt,
          options: Array.isArray(quiz.options) ? quiz.options : null,
          blankedSentence: typeof quiz.blankedSentence === 'string' ? quiz.blankedSentence : null,
          items: Array.isArray(quiz.items) ? quiz.items : null,
          correctAnswer: quiz.correctAnswer,
          acceptableAnswers: Array.isArray(quiz.acceptableAnswers) ? quiz.acceptableAnswers : null,
          rationale: quiz.rationale,
        } satisfies QuizItem;
      } catch (e) {
        console.warn('[contentParser] skipping malformed quiz item', e);
        return null;
      }
    })
    .filter((item): item is QuizItem => item !== null);

  return {
    detail: {
      explanation: detailObj.explanation,
      example: detailObj.example,
    },
    quizzes,
  };
}
