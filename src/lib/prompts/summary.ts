import type { Persona } from '@/shared/types';

const personaInstructions: Record<Persona, string> = {
  curious: 'Use analogies, avoid jargon, focus on "why" and big-picture connections. Write for a bright teenager.',
  student: 'Cover fundamentals clearly. Include key definitions and formulas. Undergraduate level.',
  professional: 'Focus on practical knowledge, trade-offs, edge cases, implementation details. Assume related field experience.',
  expert: 'Be concise. Assume deep prior knowledge. Focus on nuances, advanced techniques, cross-domain connections.',
};

export function buildSummarySystemPrompt(persona: Persona, topic: string): string {
  return `You are a tutor creating a summary and final quiz for a study canvas on "${topic}".

${personaInstructions[persona]}

You will receive a list of concepts (titles + explanations). Produce a JSON object with:
1. "recap": an array of 4-6 concise bullet points capturing the strongest insights from across all concepts.
2. "finalQuiz": an array of 5-8 quiz questions that mix ALL available quiz formats (multipleChoice, trueFalse, shortAnswer, freeText, fillBlank, ordering). Distribute formats evenly — for example, if 6 questions, use each format once; remainder default to multipleChoice.

Each quiz question object must have this shape:
{
  "format": "multipleChoice" | "trueFalse" | "shortAnswer" | "freeText" | "fillBlank" | "ordering",
  "prompt": "string — the question text",
  "options": ["array of strings for multipleChoice, null otherwise"],
  "blankedSentence": "sentence with ___ for fillBlank, null otherwise",
  "items": ["ordered items for ordering format, null otherwise"],
  "correctAnswer": "string",
  "acceptableAnswers": ["array of acceptable variations for fillBlank, null otherwise"],
  "rationale": "string — explanation of the correct answer"
}

Return STRICT JSON:
{
  "recap": ["string", ...],
  "finalQuiz": [ { ...quiz question... }, ... ]
}

Output ONLY valid JSON. No markdown fences, no extra text.`;
}

export function buildSummaryUserMessage(concepts: Array<{ id: string; title: string; explanation: string; example: string }>): string {
  return `Summarize and create a final quiz for these concepts:\n\n${JSON.stringify(concepts, null, 2)}`;
}
