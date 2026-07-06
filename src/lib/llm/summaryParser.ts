import { ParseError } from './errors';
import { extractBalanced } from './extractBalanced';
import type { QuizFormat } from '@/shared/types';
import type { QuizItem } from './contentParser';

const VALID_FORMATS: QuizFormat[] = [
  'multipleChoice', 'trueFalse', 'shortAnswer', 'freeText', 'fillBlank', 'ordering',
];

export interface SummaryResponse {
  recap: string[];
  finalQuiz: QuizItem[];
}

function parseQuizItem(raw: unknown, index: number): QuizItem {
  if (!raw || typeof raw !== 'object') throw new ParseError(`Summary quiz ${index} is not an object`);
  const item = raw as Record<string, unknown>;
  if (!VALID_FORMATS.includes(item.format as QuizFormat)) {
    throw new ParseError(`Summary quiz ${index}: invalid format "${String(item.format)}"`);
  }
  if (typeof item.prompt !== 'string') throw new ParseError(`Summary quiz ${index}: missing or invalid "prompt"`);
  if (typeof item.correctAnswer !== 'string') throw new ParseError(`Summary quiz ${index}: missing or invalid "correctAnswer"`);
  if (typeof item.rationale !== 'string') throw new ParseError(`Summary quiz ${index}: missing or invalid "rationale"`);

  return {
    format: item.format as QuizFormat,
    prompt: item.prompt,
    options: Array.isArray(item.options) ? item.options : null,
    blankedSentence: typeof item.blankedSentence === 'string' ? item.blankedSentence : null,
    items: Array.isArray(item.items) ? item.items : null,
    correctAnswer: item.correctAnswer,
    acceptableAnswers: Array.isArray(item.acceptableAnswers) ? item.acceptableAnswers : null,
    rationale: item.rationale,
  };
}

export function parseSummaryResponse(raw: string): SummaryResponse {
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

  if (!parsed) {
    throw new ParseError('Could not extract valid JSON from summary response');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ParseError('Summary response is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.recap) || obj.recap.length === 0) {
    throw new ParseError('Summary response missing or empty "recap" array');
  }
  for (let i = 0; i < obj.recap.length; i++) {
    if (typeof obj.recap[i] !== 'string') {
      throw new ParseError(`Summary recap item ${i} is not a string`);
    }
  }

  if (!Array.isArray(obj.finalQuiz) || obj.finalQuiz.length === 0) {
    throw new ParseError('Summary response missing or empty "finalQuiz" array');
  }

  const finalQuiz = obj.finalQuiz
    .map((item: unknown, i: number) => {
      try {
        return parseQuizItem(item, i);
      } catch (e) {
        console.warn('[summaryParser] skipping malformed quiz item', i, e);
        return null;
      }
    })
    .filter((item): item is QuizItem => item !== null);

  if (finalQuiz.length === 0) {
    throw new ParseError('Summary response: no valid quiz items after filtering');
  }

  return {
    recap: obj.recap as string[],
    finalQuiz,
  };
}
