import { buildOutlineSystemPrompt, buildOutlineUserMessage } from '@/lib/prompts/outline';

describe('buildOutlineSystemPrompt', () => {
  it('includes the topic in the prompt', () => {
    const prompt = buildOutlineSystemPrompt('student', 'React Hooks');
    expect(prompt).toContain('React Hooks');
  });

  it('includes persona-specific instructions', () => {
    const curious = buildOutlineSystemPrompt('curious', 'x');
    expect(curious).toContain('bright teenager');
    const expert = buildOutlineSystemPrompt('expert', 'x');
    expect(expert).toContain('deep prior knowledge');
  });

  it('includes JSON shape instructions', () => {
    const prompt = buildOutlineSystemPrompt('student', 'x');
    expect(prompt).toContain('"title"');
    expect(prompt).toContain('"concepts"');
    expect(prompt).toContain('"mcq"');
  });

  it('supports all persona levels', () => {
    const personas = ['curious', 'student', 'professional', 'expert'] as const;
    for (const p of personas) {
      const prompt = buildOutlineSystemPrompt(p, 'test');
      expect(prompt).toContain('curriculum designer');
    }
  });
});

describe('buildOutlineUserMessage', () => {
  it('includes source content', () => {
    const msg = buildOutlineUserMessage('Some source content');
    expect(msg).toContain('Some source content');
  });

  it('handles empty content', () => {
    const msg = buildOutlineUserMessage('');
    expect(msg).toContain('');
  });
});
