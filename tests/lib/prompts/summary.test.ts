import { buildSummarySystemPrompt, buildSummaryUserMessage } from '@/lib/prompts/summary';

describe('buildSummarySystemPrompt', () => {
  it('includes the topic', () => {
    const prompt = buildSummarySystemPrompt('student', 'Calculus');
    expect(prompt).toContain('Calculus');
  });

  it('includes persona instructions', () => {
    const professional = buildSummarySystemPrompt('professional', 'x');
    expect(professional).toContain('practical knowledge');
    expect(professional).toContain('edge cases');
  });

  it('requests recap and finalQuiz', () => {
    const prompt = buildSummarySystemPrompt('student', 'x');
    expect(prompt).toContain('"recap"');
    expect(prompt).toContain('"finalQuiz"');
    expect(prompt).toContain('5-8 quiz questions');
  });
});

describe('buildSummaryUserMessage', () => {
  it('serializes concepts as JSON', () => {
    const concepts = [{ id: 'c1', title: 'Concept 1', explanation: 'Exp 1', example: 'Ex 1' }];
    const msg = buildSummaryUserMessage(concepts);
    expect(msg).toContain('Concept 1');
    expect(msg).toContain('Exp 1');
    expect(msg).toContain('Ex 1');
  });
});
