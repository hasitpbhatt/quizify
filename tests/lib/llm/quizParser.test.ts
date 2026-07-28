import { parseQuizResponse } from '@/lib/llm/quizParser';

const validQuizzes = [
  {
    format: 'multipleChoice', prompt: 'Test?', options: ['A', 'B', 'C', 'D'],
    blankedSentence: null, items: null, correctAnswer: 'B', acceptableAnswers: null, rationale: 'B is right.',
  },
  {
    format: 'trueFalse', prompt: 'True or false?', options: ['True', 'False'],
    blankedSentence: null, items: null, correctAnswer: 'True', acceptableAnswers: null, rationale: 'It is true.',
  },
];

describe('parseQuizResponse', () => {
  describe('extraction strategies', () => {
    it('parses raw JSON array', () => {
      const result = parseQuizResponse(JSON.stringify(validQuizzes));
      expect(result).toHaveLength(2);
      expect(result[0].format).toBe('multipleChoice');
    });

    it('parses JSON inside code fences', () => {
      const input = '```\n' + JSON.stringify(validQuizzes) + '\n```';
      const result = parseQuizResponse(input);
      expect(result).toHaveLength(2);
    });

    it('falls back to extractBalanced with array', () => {
      const input = 'text\n' + JSON.stringify(validQuizzes) + '\nmore text';
      const result = parseQuizResponse(input);
      expect(result).toHaveLength(2);
    });
  });

  describe('validation', () => {
    it('throws on empty array', () => {
      expect(() => parseQuizResponse(JSON.stringify([]))).toThrow('Could not extract valid quiz array');
    });

    it('throws on non-array JSON', () => {
      expect(() => parseQuizResponse(JSON.stringify({}))).toThrow('Could not extract valid quiz array');
    });

    it('throws on invalid format', () => {
      const bad = [{ ...validQuizzes[0], format: 'essay' }];
      expect(() => parseQuizResponse(JSON.stringify(bad))).toThrow();
    });

    it('throws when no JSON can be extracted', () => {
      expect(() => parseQuizResponse('not json at all')).toThrow('Could not extract valid quiz array');
    });
  });

  it('filters out malformed quiz items with console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badItem = { format: 'multipleChoice' };
    const data = [badItem, validQuizzes[0]];
    const result = parseQuizResponse(JSON.stringify(data));
    expect(result).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserves fillBlank fields correctly', () => {
    const fillBlank = {
      format: 'fillBlank', prompt: 'Fill the blank: ___ is 2+2.',
      blankedSentence: 'Fill the blank: ___ is 2+2.',
      items: null, correctAnswer: 'Four', acceptableAnswers: ['Four', '4'], rationale: 'Because math.',
    };
    const result = parseQuizResponse(JSON.stringify([fillBlank]));
    expect(result[0].blankedSentence).toBe('Fill the blank: ___ is 2+2.');
    expect(result[0].acceptableAnswers).toEqual(['Four', '4']);
  });

  it('preserves ordering fields correctly', () => {
    const ordering = {
      format: 'ordering', prompt: 'Order these steps.',
      items: ['Step 1', 'Step 2', 'Step 3'],
      blankedSentence: null, correctAnswer: 'Step 1 > Step 2 > Step 3',
      acceptableAnswers: null, rationale: 'Chronological order.',
    };
    const result = parseQuizResponse(JSON.stringify([ordering]));
    expect(result[0].items).toEqual(['Step 1', 'Step 2', 'Step 3']);
  });
});
