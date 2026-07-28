import { ParseError } from './errors';
import { extractBalanced } from './extractBalanced';
import type { QuizFormat } from '@/shared/types';
import type { QuizItem } from './contentParser';

const VALID_FORMATS: QuizFormat[] = [
  'multipleChoice',
  'trueFalse',
  'shortAnswer',
  'freeText',
  'fillBlank',
  'ordering',
];

function parseQuizItem(raw: unknown, index: number): QuizItem {
  if (!raw || typeof raw !== 'object') throw new ParseError(`Quiz ${index} is not an object`);
  const item = raw as Record<string, unknown>;
  if (!VALID_FORMATS.includes(item.format as QuizFormat)) {
    throw new ParseError(`Quiz ${index}: invalid format "${String(item.format)}"`);
  }
  if (typeof item.prompt !== 'string')
    throw new ParseError(`Quiz ${index}: missing or invalid "prompt"`);
  if (typeof item.correctAnswer !== 'string')
    throw new ParseError(`Quiz ${index}: missing or invalid "correctAnswer"`);
  if (typeof item.rationale !== 'string')
    throw new ParseError(`Quiz ${index}: missing or invalid "rationale"`);

  return {
    format: item.format as QuizFormat,
    prompt: item.prompt,
    options: Array.isArray(item.options) ? (item.options as string[]) : undefined,
    blankedSentence: typeof item.blankedSentence === 'string' ? item.blankedSentence : undefined,
    items: Array.isArray(item.items) ? (item.items as string[]) : undefined,
    correctAnswer: item.correctAnswer,
    acceptableAnswers: Array.isArray(item.acceptableAnswers)
      ? (item.acceptableAnswers as string[])
      : undefined,
    rationale: item.rationale,
  };
}

export function parseQuizResponse(raw: string): QuizItem[] {
  let parsed: unknown;

  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    try {
      parsed = JSON.parse(match[1]);
    } catch {}
  }

  if (!parsed) {
    try {
      parsed = JSON.parse(raw);
    } catch {}
  }

  if (!parsed) {
    let startIdx = 0;
    while ((startIdx = raw.indexOf('[', startIdx)) !== -1) {
      const extracted = extractBalanced(raw.slice(startIdx), '[', ']');
      if (extracted) {
        try {
          const p = JSON.parse(extracted);
          if (Array.isArray(p)) {
            parsed = p;
            break;
          }
        } catch {}
      }
      startIdx++;
    }
  }

  if (!parsed) {
    let startIdx = 0;
    while ((startIdx = raw.indexOf('{', startIdx)) !== -1) {
      const extracted = extractBalanced(raw.slice(startIdx), '{', '}');
      if (extracted) {
        try {
          const p = JSON.parse(extracted);
          if (Array.isArray(p)) {
            parsed = p;
            break;
          }
        } catch {}
      }
      startIdx++;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ParseError('Could not extract valid quiz array from response');
  }

  const quizzes = parsed
    .map((item: unknown, i: number) => {
      try {
        return parseQuizItem(item, i);
      } catch (e) {
        console.warn('[quizParser] skipping malformed quiz item', i, e);
        return null;
      }
    })
    .filter((item): item is QuizItem => item !== null);

  if (quizzes.length === 0) {
    throw new ParseError('No valid quiz items after filtering');
  }

  return quizzes;
}
