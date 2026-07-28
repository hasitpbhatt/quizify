import { ParseError } from './errors';
import { extractBalanced } from './extractBalanced';
import type { QuizFormat } from '@/shared/types';

export interface QuizItem {
  format: QuizFormat;
  prompt: string;
  options?: string[];
  blankedSentence?: string;
  items?: string[];
  correctAnswer: string;
  acceptableAnswers?: string[];
  rationale: string;
}

export interface ConceptDetailContent {
  explanation: string;
  example: string;
}

export interface ContentResponse {
  detail: ConceptDetailContent;
}

export function parseContentResponse(raw: string): ContentResponse {
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
  if (typeof detailObj.explanation !== 'string')
    throw new ParseError('Missing "detail.explanation"');
  if (typeof detailObj.example !== 'string') throw new ParseError('Missing "detail.example"');

  return {
    detail: {
      explanation: detailObj.explanation,
      example: detailObj.example,
    },
  };
}
