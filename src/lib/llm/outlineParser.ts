import { ParseError } from './errors';
import { extractBalanced } from './extractBalanced';

export interface ConceptQuiz {
  format: 'mcq' | 'true-false' | 'short-answer' | 'fill-blank' | 'ordering' | 'free-text';
  question: string;
  options: string[] | null;
  answer: string | number | string[];
  explanation: string;
}

export interface OutlineData {
  title: string;
  summary: string;
  concepts: {
    id: string;
    title: string;
    explanation: string;
    quiz: ConceptQuiz;
  }[];
}

interface Candidate {
  obj: Record<string, unknown>;
  score: number;
}

function isObjectLike(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function scoreCandidate(obj: Record<string, unknown>): number {
  let score = 0;
  if (typeof obj.title === 'string' && obj.title) score += 2;
  if (Array.isArray(obj.concepts) && obj.concepts.length > 0) score += 2;
  if (typeof obj.summary === 'string') score += 1;
  return score;
}

export function parseOutline(raw: string): OutlineData {
  let parsed: unknown;

  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    try { parsed = JSON.parse(match[1]); } catch {}
  }

  if (!parsed) {
    try { parsed = JSON.parse(raw); } catch {}
  }

  if (!parsed) {
    const candidates: Candidate[] = [];
    let startIdx = 0;
    while ((startIdx = raw.indexOf('{', startIdx)) !== -1) {
      const extracted = extractBalanced(raw.slice(startIdx), '{', '}');
      if (extracted) {
        try {
          const p = JSON.parse(extracted);
          if (isObjectLike(p)) {
            candidates.push({ obj: p, score: scoreCandidate(p) });
          }
        } catch {}
      }
      startIdx++;
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      parsed = candidates[0].obj;
    }
  }

  if (!parsed) {
    throw new ParseError('Could not extract valid JSON from LLM response');
  }

  if (!isObjectLike(parsed)) {
    throw new ParseError('Parsed result is not an object');
  }

  const obj = parsed;

  if (typeof obj.title !== 'string' || !obj.title) {
    throw new ParseError('Missing or invalid "title"');
  }
  if (!Array.isArray(obj.concepts) || obj.concepts.length === 0) {
    throw new ParseError('Missing or empty "concepts" array');
  }

  // `summary` is optional downstream — never block the journey on it.
  // Fall back to the title when missing/non-string so consumers always get a usable string.
  const summary = typeof obj.summary === 'string' ? obj.summary : obj.title;

  const concepts = obj.concepts.map((c: unknown, i: number) => {
    if (!isObjectLike(c)) {
      throw new ParseError(`Concept at index ${i} is not an object`);
    }
    const concept = c;
    if (typeof concept.id !== 'string' || !concept.id) {
      throw new ParseError(`Concept ${i}: missing or invalid "id"`);
    }
    if (typeof concept.title !== 'string') {
      throw new ParseError(`Concept ${i}: missing or invalid "title"`);
    }
    if (typeof concept.explanation !== 'string') {
      throw new ParseError(`Concept ${i}: missing or invalid "explanation"`);
    }
    if (!concept.quiz || typeof concept.quiz !== 'object') {
      throw new ParseError(`Concept ${i}: missing or invalid "quiz"`);
    }
    const quiz = concept.quiz as Record<string, unknown>;
    const validFormats = ['mcq', 'true-false', 'short-answer', 'fill-blank', 'ordering', 'free-text'];
    if (!validFormats.includes(quiz.format as string)) {
      throw new ParseError(`Concept ${i}: invalid quiz format "${String(quiz.format)}"`);
    }
    return {
      id: concept.id as string,
      title: concept.title as string,
      explanation: concept.explanation as string,
      quiz: quiz as unknown as ConceptQuiz,
    };
  });

  return { title: obj.title as string, summary, concepts };
}
