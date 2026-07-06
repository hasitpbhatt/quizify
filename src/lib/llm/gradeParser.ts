import { ParseError } from './errors';

export interface GradeResult {
  grade: 'correct' | 'partial' | 'incorrect';
  rationale: string;
  idealAnswer: string;
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

export function parseGradeResponse(raw: string): GradeResult {
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
      try { parsed = JSON.parse(extracted); } catch { throw new ParseError('Could not extract valid JSON from grade response'); }
    } else {
      throw new ParseError('No JSON object found in grade response');
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ParseError('Grade response is not an object');
  }

  const obj = parsed as Record<string, unknown>;
  const grade = obj.grade;
  if (grade !== 'correct' && grade !== 'partial' && grade !== 'incorrect') {
    throw new ParseError(`Invalid grade value: "${String(grade)}"`);
  }
  if (typeof obj.rationale !== 'string') {
    throw new ParseError('Grade response missing "rationale"');
  }
  if (typeof obj.idealAnswer !== 'string') {
    throw new ParseError('Grade response missing "idealAnswer"');
  }

  return { grade, rationale: obj.rationale, idealAnswer: obj.idealAnswer };
}
