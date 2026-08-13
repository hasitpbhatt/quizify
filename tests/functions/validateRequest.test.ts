import { describe, it, expect } from 'vitest';
import { validateChatBody, ALLOWED_MODELS } from '../../functions/_shared/validateRequest';

describe('validateChatBody', () => {
  it('rejects null or non-object payloads', () => {
    expect(validateChatBody(null).valid).toBe(false);
    expect(validateChatBody('string').valid).toBe(false);
  });

  it('allows valid models in ALLOWED_MODELS', () => {
    for (const model of ALLOWED_MODELS) {
      expect(validateChatBody({ model }).valid).toBe(true);
    }
  });

  it('rejects models outside ALLOWED_MODELS', () => {
    const res = validateChatBody({ model: 'gpt-4o' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Model 'gpt-4o' is not in the server allowlist");
  });

  it('rejects excessive message counts', () => {
    const messages = Array.from({ length: 35 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));
    const res = validateChatBody({ messages });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Too many messages');
  });

  it('rejects max_tokens exceeding 4096', () => {
    const res = validateChatBody({ max_tokens: 10000 });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('max_tokens exceeds');
  });

  it('accepts valid payload', () => {
    const res = validateChatBody({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 2048,
    });
    expect(res.valid).toBe(true);
  });
});
