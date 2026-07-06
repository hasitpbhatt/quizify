import { ParseError } from './errors';

export interface ConceptDetail {
  id: string;
  title: string;
  explanation: string;
  example: string;
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

export function parseDetailExpansion(raw: string, expectedIds: string[]): ConceptDetail[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const extracted = extractBalanced(cleaned, '[', ']');
    if (extracted) {
      try { parsed = JSON.parse(extracted); } catch { throw new ParseError('Could not extract valid JSON array from detail expansion'); }
    } else {
      throw new ParseError('No balanced JSON array found in detail expansion');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new ParseError('Detail expansion result is not an array');
  }

  const details = parsed.map((item: unknown, i: number) => {
    if (!item || typeof item !== 'object') throw new ParseError(`Detail item ${i} is not an object`);
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== 'string' || !obj.id) throw new ParseError(`Detail item ${i}: missing or invalid "id"`);
    if (typeof obj.title !== 'string') throw new ParseError(`Detail item ${i}: missing or invalid "title"`);
    if (typeof obj.explanation !== 'string') throw new ParseError(`Detail item ${i}: missing or invalid "explanation"`);
    if (typeof obj.example !== 'string') throw new ParseError(`Detail item ${i}: missing or invalid "example"`);
    return { id: obj.id, title: obj.title, explanation: obj.explanation, example: obj.example };
  });

  // Verify all expected IDs are present
  const returnedIds = new Set(details.map(d => d.id));
  for (const id of expectedIds) {
    if (!returnedIds.has(id)) {
      throw new ParseError(`Detail expansion missing concept id "${id}"`);
    }
  }

  return details;
}
