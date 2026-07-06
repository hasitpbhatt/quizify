export function buildGradeSystemPrompt(conceptTitle: string): string {
  return `You are grading a learner's answer for a quiz question about "${conceptTitle}".

Return STRICT JSON:
{
  "grade": "correct" | "partial" | "incorrect",
  "rationale": "1-2 sentences tied to the concept.",
  "idealAnswer": "<canonical ideal short answer>"
}

Output ONLY valid JSON. No markdown fences, no extra text.`;
}

export function buildGradeUserMessage(prompt: string, givenAnswer: string, idealAnswer: string): string {
  return `Question: "${prompt}"
Learner's answer: "${givenAnswer}"
Ideal answer: "${idealAnswer}"`;
}
