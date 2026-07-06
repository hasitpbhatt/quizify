import { ParseError } from './errors';
import type { QuizFormat } from '@/shared/types';

const VALID_FORMATS: QuizFormat[] = [
  'multipleChoice', 'trueFalse', 'shortAnswer', 'freeText', 'fillBlank', 'ordering',
];

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

export interface ConceptQuizGroup {
  conceptId: string;
  items: QuizItem[];
}

export interface QuizResponse {
  quizzes: ConceptQuizGroup[];
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

export function parseQuizResponse(raw: string, expectedConceptIds: string[]): ConceptQuizGroup[] {
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
      try { parsed = JSON.parse(extracted); } catch { throw new ParseError('Could not extract valid JSON from quiz response'); }
    } else {
      throw new ParseError('No JSON object found in quiz response');
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ParseError('Quiz response is not an object');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.quizzes) || obj.quizzes.length === 0) {
    throw new ParseError('Missing or empty "quizzes" array');
  }

  const groups = obj.quizzes.map((g: unknown, i: number) => {
    if (!g || typeof g !== 'object') throw new ParseError(`Quiz group ${i} is not an object`);
    const group = g as Record<string, unknown>;
    if (typeof group.conceptId !== 'string' || !group.conceptId) {
      throw new ParseError(`Quiz group ${i}: missing or invalid "conceptId"`);
    }
    if (!Array.isArray(group.items) || group.items.length === 0) {
      throw new ParseError(`Quiz group ${i}: missing or empty "items" array`);
    }

    const items = group.items
      .map((item: unknown, j: number) => {
        try {
          if (!item || typeof item !== 'object') throw new Error(`Quiz ${i}.${j} is not an object`);
          const quiz = item as Record<string, unknown>;
          if (!VALID_FORMATS.includes(quiz.format as QuizFormat)) {
            throw new Error(`Quiz ${i}.${j}: invalid format "${String(quiz.format)}"`);
          }
          if (typeof quiz.prompt !== 'string') throw new Error(`Quiz ${i}.${j}: missing or invalid "prompt"`);
          if (typeof quiz.correctAnswer !== 'string') throw new Error(`Quiz ${i}.${j}: missing or invalid "correctAnswer"`);
          if (typeof quiz.rationale !== 'string') throw new Error(`Quiz ${i}.${j}: missing or invalid "rationale"`);

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
          console.warn('[quizParser] skipping malformed quiz item', e);
          return null;
        }
      })
      .filter((item): item is QuizItem => item !== null);

    return { conceptId: group.conceptId as string, items };
  });

  const foundIds = new Set(groups.map(g => g.conceptId));
  for (const id of expectedConceptIds) {
    if (!foundIds.has(id)) {
      throw new ParseError(`Quiz response missing concept id "${id}"`);
    }
  }

  return groups;
}
