import { describe, it, expect } from 'vitest';
import { truncateByParagraphs } from './truncate';

describe('truncateByParagraphs', () => {
  it('returns short text unchanged', () => {
    const text = 'Hello world.';
    expect(truncateByParagraphs(text)).toBe('Hello world.');
  });

  it('truncates when combined paragraphs exceed SOFT_MAX', () => {
    const paragraph = 'A'.repeat(2000);
    const text = Array.from({ length: 20 }, () => paragraph).join('\n\n');
    const result = truncateByParagraphs(text);
    expect(result.length).toBeGreaterThanOrEqual(18_000);
    expect(result.length).toBeLessThan(22_500);
  });

  it('preserves paragraph boundaries', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const result = truncateByParagraphs(text);
    expect(result).toContain('First paragraph.');
    expect(result).toContain('Second paragraph.');
  });

  it('filters empty paragraphs', () => {
    const text = 'One.\n\n\n\nTwo.';
    const result = truncateByParagraphs(text);
    expect(result).not.toContain('\n\n\n\n');
  });

  it('returns all content when under SOFT_MAX', () => {
    const text = 'Short content.\n\nStill short.';
    const result = truncateByParagraphs(text);
    expect(result).toBe(text);
  });
});
