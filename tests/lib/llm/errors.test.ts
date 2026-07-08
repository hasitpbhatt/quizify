import { describe, it, expect } from 'vitest';
import { AuthError, RateLimitError, ParseError, NetworkError } from '@/lib/llm/errors';

describe('AuthError', () => {
  it('extends Error', () => {
    expect(new AuthError()).toBeInstanceOf(Error);
  });

  it('has name AuthError', () => {
    expect(new AuthError().name).toBe('AuthError');
  });

  it('has default message', () => {
    expect(new AuthError().message).toBe('API key rejected');
  });

  it('accepts custom message', () => {
    expect(new AuthError('custom').message).toBe('custom');
  });
});

describe('RateLimitError', () => {
  it('extends Error', () => {
    expect(new RateLimitError()).toBeInstanceOf(Error);
  });

  it('has name RateLimitError', () => {
    expect(new RateLimitError().name).toBe('RateLimitError');
  });

  it('has default message', () => {
    expect(new RateLimitError().message).toBe('Rate limited — try again in a moment');
  });

  it('accepts custom message', () => {
    expect(new RateLimitError('custom').message).toBe('custom');
  });
});

describe('ParseError', () => {
  it('extends Error', () => {
    expect(new ParseError()).toBeInstanceOf(Error);
  });

  it('has name ParseError', () => {
    expect(new ParseError().name).toBe('ParseError');
  });

  it('has default message', () => {
    expect(new ParseError().message).toBe('Failed to parse LLM response');
  });

  it('accepts custom message', () => {
    expect(new ParseError('custom').message).toBe('custom');
  });
});

describe('NetworkError', () => {
  it('extends Error', () => {
    expect(new NetworkError()).toBeInstanceOf(Error);
  });

  it('has name NetworkError', () => {
    expect(new NetworkError().name).toBe('NetworkError');
  });

  it('has default message', () => {
    expect(new NetworkError().message).toBe('Network request failed');
  });

  it('accepts custom message', () => {
    expect(new NetworkError('custom').message).toBe('custom');
  });
});
