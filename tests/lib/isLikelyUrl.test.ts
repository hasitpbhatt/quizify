import { isLikelyUrl } from '@/lib/fetchSourceContent';

describe('isLikelyUrl', () => {
  it('returns true for http URLs', () => {
    expect(isLikelyUrl('http://example.com')).toBe(true);
  });

  it('returns true for https URLs', () => {
    expect(isLikelyUrl('https://example.com')).toBe(true);
  });

  it('returns true for URLs with www', () => {
    expect(isLikelyUrl('www.example.com')).toBe(true);
  });

  it('returns true for domain with path but no protocol', () => {
    expect(isLikelyUrl('example.com/page')).toBe(true);
  });

  it('returns true for URLs with subdomains', () => {
    expect(isLikelyUrl('sub.example.com')).toBe(true);
  });

  it('returns false for plain text with spaces', () => {
    expect(isLikelyUrl('hello world')).toBe(false);
  });

  it('returns false for single word without dot', () => {
    expect(isLikelyUrl('hello')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLikelyUrl('')).toBe(false);
  });

  it('returns true for domain-like without protocol but with dot', () => {
    expect(isLikelyUrl('example.com')).toBe(true);
  });

  it('returns false for IP-address-like input without dots', () => {
    expect(isLikelyUrl('localhost')).toBe(false);
  });

  it('handles URLs with trailing slash', () => {
    expect(isLikelyUrl('https://example.com/')).toBe(true);
  });

  it('handles URLs with query parameters', () => {
    expect(isLikelyUrl('https://example.com/page?q=search&lang=en')).toBe(true);
  });

  it('returns false for numbers', () => {
    expect(isLikelyUrl('12345')).toBe(false);
  });

  it('trims whitespace before checking', () => {
    expect(isLikelyUrl('  https://example.com  ')).toBe(true);
  });

  it('returns false for text containing spaces even with a dot', () => {
    expect(isLikelyUrl('click here example.com')).toBe(false);
  });
});
