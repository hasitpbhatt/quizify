import { parseContentResponse } from '@/lib/llm/contentParser';

const validContent = {
  detail: { explanation: 'A thorough explanation of the concept.', example: 'A concrete example.' },
};

describe('parseContentResponse', () => {
  describe('extraction strategies', () => {
    it('parses raw JSON', () => {
      const result = parseContentResponse(JSON.stringify(validContent));
      expect(result.detail.explanation).toBe('A thorough explanation of the concept.');
      expect(result.detail.example).toBe('A concrete example.');
    });

    it('parses JSON inside code fences', () => {
      const input = '```\n' + JSON.stringify(validContent) + '\n```';
      const result = parseContentResponse(input);
      expect(result.detail.example).toBe('A concrete example.');
    });

    it('falls back to extractBalanced', () => {
      const input = 'text\n' + JSON.stringify(validContent) + '\nmore text';
      const result = parseContentResponse(input);
      expect(result.detail.explanation).toBe('A thorough explanation of the concept.');
    });
  });

  describe('validation', () => {
    it('throws on missing detail', () => {
      expect(() => parseContentResponse(JSON.stringify({}))).toThrow('Missing or invalid "detail"');
    });

    it('throws on missing detail.explanation', () => {
      const bad = { detail: { example: 'x' } };
      expect(() => parseContentResponse(JSON.stringify(bad))).toThrow('Missing "detail.explanation"');
    });

    it('throws on missing detail.example', () => {
      const bad = { detail: { explanation: 'x' } };
      expect(() => parseContentResponse(JSON.stringify(bad))).toThrow('Missing "detail.example"');
    });

    it('throws when no JSON can be extracted', () => {
      expect(() => parseContentResponse('not json at all')).toThrow('Could not extract valid JSON');
    });
  });

  describe('json response_format', () => {
    it('parses content when LLM wraps in json_response_format', () => {
      const result = parseContentResponse(JSON.stringify(validContent));
      expect(result.detail.explanation).toBe('A thorough explanation of the concept.');
    });
  });
});
