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

  it('lists all 6 quiz formats', () => {
    const prompt = buildContentSystemPrompt('student', 'x');
    expect(prompt).toContain('multipleChoice');
    expect(prompt).toContain('trueFalse');
    expect(prompt).toContain('shortAnswer');
    expect(prompt).toContain('freeText');
    expect(prompt).toContain('fillBlank');
    expect(prompt).toContain('ordering');
  });

  it('instructs to return JSON', () => {
    const prompt = buildContentSystemPrompt('student', 'x');
    expect(prompt).toContain('"detail"');
    expect(prompt).toContain('"quizzes"');
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
