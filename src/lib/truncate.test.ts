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

  it('handles empty string', () => {
    expect(truncateByParagraphs('')).toBe('');
  });

  it('handles single very long paragraph by including it whole', () => {
    const text = 'A'.repeat(50_000);
    const result = truncateByParagraphs(text);
    expect(result.length).toBe(50_000);
  });

  it('handles text with only whitespace paragraphs', () => {
    const text = 'First.\n\n   \n\nSecond.';
    const result = truncateByParagraphs(text);
    expect(result).toContain('First.');
    expect(result).toContain('Second.');
    expect(result).not.toContain('   ');
  });

  it('preserves single newlines within paragraphs', () => {
    const text = 'Line one.\nLine two.\n\nNext paragraph.';
    const result = truncateByParagraphs(text);
    expect(result).toContain('Line one.\nLine two');
  });

  it('handles very short paragraphs with many of them', () => {
    const paragraphs = Array.from({ length: 100 }, (_, i) => `P${i}.`);
    const text = paragraphs.join('\n\n');
    const result = truncateByParagraphs(text);
    expect(result).toContain('P0.');
    expect(result).toContain('P99.');
  });
});
