import { parseSummaryResponse } from '@/lib/llm/summaryParser';

const validSummary = {
  recap: ['Point one about the topic.', 'Point two about the topic.', 'Point three.'],
  finalQuiz: [
    {
      format: 'multipleChoice', prompt: 'Test?', options: ['A', 'B', 'C', 'D'],
      blankedSentence: null, items: null, correctAnswer: 'A', acceptableAnswers: null, rationale: 'A is right.',
    },
  ],
};

describe('parseSummaryResponse', () => {
  it('parses raw JSON', () => {
    const result = parseSummaryResponse(JSON.stringify(validSummary));
    expect(result.recap).toHaveLength(3);
    expect(result.finalQuiz).toHaveLength(1);
  });

  it('parses JSON in code fences', () => {
    const input = '```\n' + JSON.stringify(validSummary) + '\n```';
    const result = parseSummaryResponse(input);
    expect(result.recap[0]).toBe('Point one about the topic.');
  });

  it('falls back to extractBalanced', () => {
    const input = 'text\n' + JSON.stringify(validSummary) + '\nmore';
    const result = parseSummaryResponse(input);
    expect(result.finalQuiz).toHaveLength(1);
  });

  it('throws on missing recap', () => {
    const { recap: _recap, ...rest } = validSummary;
    expect(() => parseSummaryResponse(JSON.stringify(rest))).toThrow('Summary response missing or empty "recap"');
  });

  it('throws on empty recap', () => {
    expect(() => parseSummaryResponse(JSON.stringify({ ...validSummary, recap: [] })))
      .toThrow('Summary response missing or empty "recap"');
  });

  it('throws if recap item is not a string', () => {
    expect(() => parseSummaryResponse(JSON.stringify({ ...validSummary, recap: [42] })))
      .toThrow('Summary recap item 0 is not a string');
  });

  it('throws on missing finalQuiz', () => {
    const { finalQuiz: _finalQuiz, ...rest } = validSummary;
    expect(() => parseSummaryResponse(JSON.stringify(rest))).toThrow('Summary response missing or empty "finalQuiz"');
  });

  it('throws on empty finalQuiz', () => {
    expect(() => parseSummaryResponse(JSON.stringify({ ...validSummary, finalQuiz: [] })))
      .toThrow('Summary response missing or empty "finalQuiz"');
  });

  it('throws when all quiz items are filtered out', () => {
    const bad = { ...validSummary, finalQuiz: [{ format: 'invalid' }] };
    expect(() => parseSummaryResponse(JSON.stringify(bad))).toThrow('no valid quiz items after filtering');
  });

  it('filters malformed quiz items and keeps valid ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { format: 'multipleChoice' }; // missing fields
    const data = { ...validSummary, finalQuiz: [bad, validSummary.finalQuiz[0]] };
    const result = parseSummaryResponse(JSON.stringify(data));
    expect(result.finalQuiz).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it('throws when no JSON can be extracted', () => {
    expect(() => parseSummaryResponse('completely invalid')).toThrow('Could not extract valid JSON');
  });
});
