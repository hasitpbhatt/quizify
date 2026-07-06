import { extractBalanced } from '@/lib/llm/extractBalanced';

describe('extractBalanced', () => {
  it('extracts a simple balanced pair', () => {
    expect(extractBalanced('{hello}', '{', '}')).toBe('{hello}');
  });

  it('extracts nested balanced pairs', () => {
    expect(extractBalanced('{outer {inner}}', '{', '}')).toBe('{outer {inner}}');
  });

  it('returns null when no opening char found', () => {
    expect(extractBalanced('no braces here', '{', '}')).toBeNull();
  });

  it('returns null when pair is not closed', () => {
    expect(extractBalanced('{unclosed', '{', '}')).toBeNull();
  });

  it('ignores braces inside strings', () => {
    const text = '{"key": "value with {brace}"}';
    expect(extractBalanced(text, '{', '}')).toBe(text);
  });

  it('handles escaped quotes inside strings', () => {
    const text = '{"key": "value with \\"quote { inside"}';
    expect(extractBalanced(text, '{', '}')).toBe(text);
  });

  it('handles only the outermost pair when multiple pairs exist', () => {
    expect(extractBalanced('{first} and {second}', '{', '}')).toBe('{first}');
  });

  it('starts extraction from first opening char', () => {
    const text = 'prefix text {content} suffix';
    expect(extractBalanced(text, '{', '}')).toBe('{content}');
  });

  it('returns null when there is an unclosed bracket before a valid pair', () => {
    expect(extractBalanced('prefix {unclosed {balanced} suffix', '{', '}')).toBeNull();
  });

  it('handles deep nesting', () => {
    const text = '{a{b{c{d}e}f}g}';
    expect(extractBalanced(text, '{', '}')).toBe(text);
  });

  it('works with different bracket types', () => {
    expect(extractBalanced('[a[b]c]', '[', ']')).toBe('[a[b]c]');
  });

  it('handles empty object', () => {
    expect(extractBalanced('{}', '{', '}')).toBe('{}');
  });
});
