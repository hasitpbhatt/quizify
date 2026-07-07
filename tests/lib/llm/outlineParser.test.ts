import { parseOutline } from '@/lib/llm/outlineParser';

const validOutline = {
  title: 'Test Canvas',
  summary: 'A test summary of the topic.',
  concepts: [
    {
      id: 'basic-concept',
      title: 'Basic Concept',
      explanation: 'This is a basic concept explanation that spans multiple sentences.',
      quiz: { format: 'mcq', question: 'Test?', options: ['A', 'B', 'C', 'D'], answer: 'A', explanation: 'A is right.' },
    },
    {
      id: 'advanced-topic',
      title: 'Advanced Topic',
      explanation: 'An advanced explanation for testing.',
      quiz: { format: 'true-false', question: 'True or false?', options: ['True', 'False'], answer: 'True', explanation: 'It is true.' },
    },
  ],
};

describe('parseOutline', () => {
  describe('extraction strategies', () => {
    it('parses raw JSON without fences', () => {
      const result = parseOutline(JSON.stringify(validOutline));
      expect(result.title).toBe('Test Canvas');
      expect(result.concepts).toHaveLength(2);
    });

    it('parses JSON inside markdown code fences', () => {
      const input = 'Some preamble\n\n```json\n' + JSON.stringify(validOutline) + '\n```\n\nSome postamble';
      const result = parseOutline(input);
      expect(result.title).toBe('Test Canvas');
    });

    it('parses JSON inside fences without language tag', () => {
      const input = '```\n' + JSON.stringify(validOutline) + '\n```';
      const result = parseOutline(input);
      expect(result.title).toBe('Test Canvas');
    });

    it('falls back to extractBalanced when raw and fence parsing fail', () => {
      const input = 'Text before\n' + JSON.stringify(validOutline, null, 2) + '\nText after';
      const result = parseOutline(input);
      expect(result.title).toBe('Test Canvas');
    });
  });

  describe('validation', () => {
    it('throws ParseError when no JSON found', () => {
      expect(() => parseOutline('This is just plain text without any JSON'))
        .toThrow('Could not extract valid JSON from LLM response');
    });

    it('throws on missing title', () => {
      const { title: _title, ...rest } = validOutline;
      expect(() => parseOutline(JSON.stringify(rest))).toThrow('Missing or invalid "title"');
    });

    it('throws on empty title', () => {
      expect(() => parseOutline(JSON.stringify({ ...validOutline, title: '' })))
        .toThrow('Missing or invalid "title"');
    });

    it('throws on missing summary', () => {
      const { summary: _summary, ...rest } = validOutline;
      expect(() => parseOutline(JSON.stringify(rest))).toThrow('Missing or invalid "summary"');
    });

    it('throws on missing concepts array', () => {
      const { concepts: _concepts, ...rest } = validOutline;
      expect(() => parseOutline(JSON.stringify(rest))).toThrow('Missing or empty "concepts"');
    });

    it('throws on empty concepts array', () => {
      expect(() => parseOutline(JSON.stringify({ ...validOutline, concepts: [] })))
        .toThrow('Missing or empty "concepts"');
    });

    it('throws on concept without id', () => {
      const bad = { ...validOutline, concepts: [{ title: 'No ID', explanation: 'x', quiz: validOutline.concepts[0].quiz }] };
      expect(() => parseOutline(JSON.stringify(bad))).toThrow('missing or invalid "id"');
    });

    it('throws on invalid quiz format', () => {
      const bad = { ...validOutline, concepts: [{ ...validOutline.concepts[0], quiz: { format: 'essay', question: '?', options: null, answer: 'x', explanation: 'y' } }] };
      expect(() => parseOutline(JSON.stringify(bad))).toThrow('invalid quiz format');
    });

    it('throws on non-object concept', () => {
      expect(() => parseOutline(JSON.stringify({ ...validOutline, concepts: ['not an object'] })))
        .toThrow('is not an object');
    });
  });

  describe('varied quiz formats', () => {
    const formats = ['mcq', 'true-false', 'short-answer', 'fill-blank', 'ordering', 'free-text'] as const;
    for (const format of formats) {
      it(`accepts format "${format}"`, () => {
        const data = {
          ...validOutline,
          concepts: [{ ...validOutline.concepts[0], quiz: { format, question: '?', options: null, answer: 'ans', explanation: 'reason' } }],
        };
        const result = parseOutline(JSON.stringify(data));
        expect(result.concepts[0].quiz.format).toBe(format);
      });
    }
  });

  it('preserves all concept fields', () => {
    const result = parseOutline(JSON.stringify(validOutline));
    expect(result.concepts[0].id).toBe('basic-concept');
    expect(result.concepts[0].title).toBe('Basic Concept');
    expect(result.concepts[0].explanation).toBeTruthy();
    expect(result.concepts[0].quiz.question).toBe('Test?');
  });

  it('handles JSON with extra whitespace and newlines', () => {
    const input = `  \n\n  ${JSON.stringify(validOutline)}  \n\n  `;
    const result = parseOutline(input);
    expect(result.title).toBe('Test Canvas');
  });

  it('prefers fence content over raw JSON when both exist', () => {
    const fenceContent = { ...validOutline, title: 'From Fence' };
    const input = '```json\n' + JSON.stringify(fenceContent) + '\n```\n' + JSON.stringify(validOutline);
    const result = parseOutline(input);
    expect(result.title).toBe('From Fence');
  });
});
