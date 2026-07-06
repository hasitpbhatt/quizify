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
    throw new ParseError('Could not extract valid JSON from LLM response');
  }

  // Validate shape
  if (!parsed || typeof parsed !== 'object') {
    throw new ParseError('Parsed result is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.title !== 'string' || !obj.title) {
    throw new ParseError('Missing or invalid "title"');
  }
  if (typeof obj.summary !== 'string') {
    throw new ParseError('Missing or invalid "summary"');
  }
  if (!Array.isArray(obj.concepts) || obj.concepts.length === 0) {
    throw new ParseError('Missing or empty "concepts" array');
  }

  const concepts = obj.concepts.map((c: unknown, i: number) => {
    if (!c || typeof c !== 'object') {
      throw new ParseError(`Concept at index ${i} is not an object`);
    }
    const concept = c as Record<string, unknown>;
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

  return { title: obj.title as string, summary: obj.summary as string, concepts };
}
