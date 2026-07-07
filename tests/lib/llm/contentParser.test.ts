import { parseContentResponse } from '@/lib/llm/contentParser';

const validContent = {
  detail: { explanation: 'A thorough explanation of the concept.', example: 'A concrete example.' },
  quizzes: [
    {
      format: 'multipleChoice', prompt: 'Test?', options: ['A', 'B', 'C', 'D'],
      blankedSentence: null, items: null, correctAnswer: 'B', acceptableAnswers: null, rationale: 'B is right.',
    },
    {
      format: 'trueFalse', prompt: 'True or false?', options: ['True', 'False'],
      blankedSentence: null, items: null, correctAnswer: 'True', acceptableAnswers: null, rationale: 'It is true.',
    },
  ],
};

describe('parseContentResponse', () => {
  describe('extraction strategies', () => {
    it('parses raw JSON', () => {
      const result = parseContentResponse(JSON.stringify(validContent));
      expect(result.detail.explanation).toBe('A thorough explanation of the concept.');
      expect(result.quizzes).toHaveLength(2);
    });

    it('parses JSON inside code fences', () => {
      const input = '```\n' + JSON.stringify(validContent) + '\n```';
      const result = parseContentResponse(input);
      expect(result.detail.example).toBe('A concrete example.');
    });

    it('falls back to extractBalanced', () => {
      const input = 'text\n' + JSON.stringify(validContent) + '\nmore text';
      const result = parseContentResponse(input);
      expect(result.quizzes).toHaveLength(2);
    });
  });

  describe('validation', () => {
    it('throws on missing detail', () => {
      const { detail: _detail, ...rest } = validContent;
      expect(() => parseContentResponse(JSON.stringify(rest))).toThrow('Missing or invalid "detail"');
    });

    it('throws on missing detail.explanation', () => {
      const bad = { ...validContent, detail: { example: 'x' } };
      expect(() => parseContentResponse(JSON.stringify(bad))).toThrow('Missing "detail.explanation"');
    });

    it('throws on missing detail.example', () => {
      const bad = { ...validContent, detail: { explanation: 'x' } };
      expect(() => parseContentResponse(JSON.stringify(bad))).toThrow('Missing "detail.example"');
    });

    it('throws on empty quizzes', () => {
      expect(() => parseContentResponse(JSON.stringify({ ...validContent, quizzes: [] })))
        .toThrow('Missing or empty "quizzes"');
    });

    it('throws on missing quizzes', () => {
      const { quizzes: _quizzes, ...rest } = validContent;
      expect(() => parseContentResponse(JSON.stringify(rest))).toThrow('Missing or empty "quizzes"');
    });

    it('filters out invalid quiz format with console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const bad = { ...validContent, quizzes: [{ ...validContent.quizzes[0], format: 'essay' }] };
      const result = parseContentResponse(JSON.stringify(bad));
      expect(result.quizzes).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('throws when no JSON can be extracted', () => {
      expect(() => parseContentResponse('not json at all')).toThrow('Could not extract valid JSON');
    });
  });

  describe('json response_format', () => {
    it('parses content when LLM wraps in json_response_format', () => {
      const jsonStr = JSON.stringify(validContent);
      const result = parseContentResponse(jsonStr);
      expect(result.detail.explanation).toBe('A thorough explanation of the concept.');
    });
  });

  it('filters out malformed quiz items with console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badItem = { format: 'multipleChoice' }; // no prompt, correctAnswer, rationale
    const data = { ...validContent, quizzes: [badItem, validContent.quizzes[0]] };
    const result = parseContentResponse(JSON.stringify(data));
    expect(result.quizzes).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserves fillBlank fields correctly', () => {
    const fillBlank = {
      format: 'fillBlank', prompt: 'Fill the blank: ___ is 2+2.',
      blankedSentence: 'Fill the blank: ___ is 2+2.',
      items: null, correctAnswer: 'Four', acceptableAnswers: ['Four', '4'], rationale: 'Because math.',
    };
    const data = { ...validContent, quizzes: [fillBlank] };
    const result = parseContentResponse(JSON.stringify(data));
    expect(result.quizzes[0].blankedSentence).toBe('Fill the blank: ___ is 2+2.');
    expect(result.quizzes[0].acceptableAnswers).toEqual(['Four', '4']);
  });

  it('preserves ordering fields correctly', () => {
    const ordering = {
      format: 'ordering', prompt: 'Order these steps.',
      items: ['Step 1', 'Step 2', 'Step 3'],
      blankedSentence: null, correctAnswer: 'Step 1 > Step 2 > Step 3',
      acceptableAnswers: null, rationale: 'Chronological order.',
    };
    const data = { ...validContent, quizzes: [ordering] };
    const result = parseContentResponse(JSON.stringify(data));
    expect(result.quizzes[0].items).toEqual(['Step 1', 'Step 2', 'Step 3']);
  });
});
