import { buildGradeSystemPrompt, buildGradeUserMessage } from '@/lib/prompts/grade';

describe('buildGradeSystemPrompt', () => {
  it('includes grading instructions', () => {
    const prompt = buildGradeSystemPrompt('Test Concept');
    expect(prompt).toContain('"correct"');
    expect(prompt).toContain('"partial"');
    expect(prompt).toContain('"incorrect"');
    expect(prompt).toContain('"rationale"');
    expect(prompt).toContain('"idealAnswer"');
  });
});

describe('buildGradeUserMessage', () => {
  it('includes the question', () => {
    const msg = buildGradeUserMessage('What is 2+2?', '4', '4');
    expect(msg).toContain('What is 2+2?');
  });

  it('includes the user answer', () => {
    const msg = buildGradeUserMessage('Q', 'My answer', 'Correct Answer');
    expect(msg).toContain('My answer');
  });

  it('includes the correct answer', () => {
    const msg = buildGradeUserMessage('Q', 'A', 'Correct Answer');
    expect(msg).toContain('Correct Answer');
  });
});
