import { ParseError } from './errors';
import { extractBalanced } from './extractBalanced';

export interface GradeResult {
  grade: 'correct' | 'partial' | 'incorrect';
  rationale: string;
  idealAnswer: string;
}

export function parseGradeResponse(raw: string): GradeResult {
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
    throw new ParseError('Could not extract valid JSON from grade response');
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
