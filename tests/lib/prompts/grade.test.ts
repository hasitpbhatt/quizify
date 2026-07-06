import { buildGradeSystemPrompt, buildGradeUserMessage } from '@/lib/prompts/grade';

describe('buildGradeSystemPrompt', () => {
  it('includes grading instructions', () => {
    // Check your source definition; if it expects a config object, pass one.
    // If it expects no arguments, change this to buildGradeSystemPrompt()
    const prompt = buildGradeSystemPrompt(); 
    expect(prompt).toContain('"correct"');
    expect(prompt).toContain('"partial"');
    expect(prompt).toContain('"incorrect"');
    expect(prompt).toContain('"rationale"');
    expect(prompt).toContain('"idealAnswer"');
  });
});

describe('buildGradeUserMessage', () => {
  // Assuming the signature is: (question: string, userAnswer: string, correctAnswer: string)
  // We remove the 4th argument ("Rationale") that was causing the error.

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
