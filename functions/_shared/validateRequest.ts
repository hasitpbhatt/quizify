export interface ValidatedChatBody {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
  stream?: boolean;
  [key: string]: unknown;
}

export const ALLOWED_MODELS = new Set([
  'mistral-large-latest',
  'mistral-medium-2508',
  'mistral-medium-2505',
  'mistral-medium-latest',
  'mistral-small-latest',
  'mistral-small-2506',
  'voxtral-mini-tts-2603',
  'voxtral-mini-transcribe-2602',
]);

export function validateChatBody(body: unknown): { valid: boolean; error?: string; data?: ValidatedChatBody } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const b = body as Record<string, unknown>;

  if (b.model && typeof b.model === 'string' && !ALLOWED_MODELS.has(b.model)) {
    return { valid: false, error: `Model '${b.model}' is not in the server allowlist.` };
  }

  if (b.messages) {
    if (!Array.isArray(b.messages)) {
      return { valid: false, error: "'messages' must be an array." };
    }
    if (b.messages.length > 30) {
      return { valid: false, error: 'Too many messages in conversation payload (max 30).' };
    }
  }

  if (b.max_tokens && typeof b.max_tokens === 'number' && b.max_tokens > 4096) {
    return { valid: false, error: 'max_tokens exceeds allowable limit (max 4096).' };
  }

  return { valid: true, data: b as ValidatedChatBody };
}
