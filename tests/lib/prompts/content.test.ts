import { buildContentSystemPrompt, buildContentUserMessage } from '@/lib/prompts/content';

describe('buildContentSystemPrompt', () => {
  it('includes the topic', () => {
    const prompt = buildContentSystemPrompt('student', 'Binary Trees');
    expect(prompt).toContain('Binary Trees');
  });

  it('includes persona instructions', () => {
    const expert = buildContentSystemPrompt('expert', 'x');
    expect(expert).toContain('nuances');
    expect(expert).toContain('advanced techniques');
  });

  it('instructs to return detail JSON', () => {
    const prompt = buildContentSystemPrompt('student', 'x');
    expect(prompt).toContain('"detail"');
    expect(prompt).toContain('explanation');
    expect(prompt).toContain('example');
  });

  it('does not mention quiz formats', () => {
    const prompt = buildContentSystemPrompt('student', 'x');
    expect(prompt).not.toContain('multipleChoice');
    expect(prompt).not.toContain('quiz');
  });
});

describe('buildContentUserMessage', () => {
  it('includes concept id, title, and explanation', () => {
    const msg = buildContentUserMessage({ id: 'c1', title: 'Sorting', explanation: 'Sorting is...' });
    expect(msg).toContain('c1');
    expect(msg).toContain('Sorting');
    expect(msg).toContain('Sorting is...');
  });
});
