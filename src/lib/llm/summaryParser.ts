import { ParseError } from './errors';
import type { QuizFormat } from '@/shared/types';
import type { QuizItem } from './quizParser';

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

function extractBalanced(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === open) depth++;
      if (ch === close) { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
  }
  return null;
}

export function parseSummaryResponse(raw: string): SummaryResponse {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const extracted = extractBalanced(cleaned, '{', '}');
    if (extracted) {
      try { parsed = JSON.parse(extracted); } catch { throw new ParseError('Could not extract valid JSON from summary response'); }
    } else {
      throw new ParseError('No JSON object found in summary response');
    }
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
