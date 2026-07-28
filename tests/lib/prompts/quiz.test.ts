import { buildQuizSystemPrompt, buildQuizUserMessage } from '@/lib/prompts/quiz';

describe('buildQuizSystemPrompt', () => {
  it('includes the topic', () => {
    const prompt = buildQuizSystemPrompt('student', 'Binary Trees');
    expect(prompt).toContain('Binary Trees');
  });

  it('includes persona instructions', () => {
    const expert = buildQuizSystemPrompt('expert', 'x');
    expect(expert).toContain('nuances');
  });

  it('lists all 6 quiz formats', () => {
    const prompt = buildQuizSystemPrompt('student', 'x');
    expect(prompt).toContain('multipleChoice');
    expect(prompt).toContain('trueFalse');
    expect(prompt).toContain('shortAnswer');
    expect(prompt).toContain('freeText');
    expect(prompt).toContain('fillBlank');
    expect(prompt).toContain('ordering');
  });

  it('instructs to return a JSON array', () => {
    const prompt = buildQuizSystemPrompt('student', 'x');
    expect(prompt).toContain('JSON array');
  });
});

describe('buildQuizUserMessage', () => {
  it('includes concept fields', () => {
    const msg = buildQuizUserMessage({
      id: 'c1', title: 'Sorting', explanation: 'Sorting is...', example: 'Bubble sort',
    });
    expect(msg).toContain('c1');
    expect(msg).toContain('Sorting');
    expect(msg).toContain('Sorting is...');
    expect(msg).toContain('Bubble sort');
  });
});
