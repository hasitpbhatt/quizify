import { buildGradeSystemPrompt, buildGradeUserMessage } from '@/lib/prompts/grade';

describe('buildGradeSystemPrompt', () => {
  it('includes grading instructions', () => {
    const prompt = buildGradeSystemPrompt();
    expect(prompt).toContain('"correct"');
    expect(prompt).toContain('"partial"');
    expect(prompt).toContain('"incorrect"');
    expect(prompt).toContain('"rationale"');
    expect(prompt).toContain('"idealAnswer"');
  });
});

describe('buildGradeUserMessage', () => {
  it('includes the question', () => {
    const msg = buildGradeUserMessage('What is 2+2?', '4', '2+2', 'Addition is basic.');
    expect(msg).toContain('What is 2+2?');
  });

  it('includes the user answer', () => {
    const msg = buildGradeUserMessage('Q', 'My answer', 'Correct', 'Rationale');
    expect(msg).toContain('My answer');
  });

  it('includes the correct answer', () => {
    const msg = buildGradeUserMessage('Q', 'A', 'Correct Answer', 'Rationale');
    expect(msg).toContain('Correct Answer');
  });

});
