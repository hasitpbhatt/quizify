import { parseGradeResponse } from '@/lib/llm/gradeParser';

describe('parseGradeResponse', () => {
  const valid = { grade: 'correct', rationale: 'Well reasoned.', idealAnswer: 'The expected answer.' };

  it('parses raw JSON', () => {
    const result = parseGradeResponse(JSON.stringify(valid));
    expect(result.grade).toBe('correct');
    expect(result.rationale).toBe('Well reasoned.');
    expect(result.idealAnswer).toBe('The expected answer.');
  });

  it('parses JSON in code fences', () => {
    const input = '```\n' + JSON.stringify(valid) + '\n```';
    const result = parseGradeResponse(input);
    expect(result.grade).toBe('correct');
  });

  it('falls back to extractBalanced', () => {
    const input = 'thinking\n' + JSON.stringify(valid) + '\nmore';
    const result = parseGradeResponse(input);
    expect(result.grade).toBe('correct');
  });

  it('accepts "partial" grade', () => {
    const result = parseGradeResponse(JSON.stringify({ ...valid, grade: 'partial' }));
    expect(result.grade).toBe('partial');
  });

  it('accepts "incorrect" grade', () => {
    const result = parseGradeResponse(JSON.stringify({ ...valid, grade: 'incorrect' }));
    expect(result.grade).toBe('incorrect');
  });

  it('throws on invalid grade value', () => {
    expect(() => parseGradeResponse(JSON.stringify({ ...valid, grade: 'unknown' })))
      .toThrow('Invalid grade value');
  });

  it('throws on missing rationale', () => {
    const { rationale: _rationale, ...rest } = valid;
    expect(() => parseGradeResponse(JSON.stringify(rest))).toThrow('missing "rationale"');
  });

  it('throws on missing idealAnswer', () => {
    const { idealAnswer: _idealAnswer, ...rest } = valid;
    expect(() => parseGradeResponse(JSON.stringify(rest))).toThrow('missing "idealAnswer"');
  });

  it('throws when no JSON can be extracted', () => {
    expect(() => parseGradeResponse('garbage')).toThrow('Could not extract valid JSON');
  });

  it('throws on non-object JSON', () => {
    expect(() => parseGradeResponse(JSON.stringify('string'))).toThrow('is not an object');
  });
});
