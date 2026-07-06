import type { Persona } from '@/shared/types';

const personaInstructions: Record<Persona, string> = {
  curious: 'Use analogies, avoid jargon, focus on "why" and big-picture connections. Write for a bright teenager. Quizzes should be introductory.',
  student: 'Cover fundamentals clearly. Include key definitions and formulas. Undergraduate level quizzes.',
  professional: 'Focus on practical knowledge, trade-offs, edge cases, implementation details. Assume related field experience. Practitioner level quizzes.',
  expert: 'Be concise. Assume deep prior knowledge. Focus on nuances, advanced techniques, cross-domain connections. Advanced level quizzes.',
};

export function buildContentSystemPrompt(persona: Persona, topic: string): string {
  return `You are a subject-matter expert expanding concepts and creating quizzes for a study canvas on "${topic}".

${personaInstructions[persona]}

You will receive ONE concept with an ID, title, and a brief explanation.
You must:
1. Expand the explanation to 2-3 paragraphs and provide a concrete, memorable example.
2. Generate 3-5 quiz questions that test understanding of this concept.

Quiz formats available:
- "multipleChoice": 4 options, one correct
- "trueFalse": exactly 2 options (True / False), one correct
- "shortAnswer": brief written answer (1-2 sentences)
- "freeText": open-ended response (describe what to look for in answer)
- "fillBlank": sentence with a blank marked by ___
- "ordering": list of items that need to be ordered correctly

Return a JSON object with EXACTLY this shape:
{
  "detail": {
    "explanation": "string — 2-3 paragraphs, ~200-400 words total",
    "example": "string — one concrete example or analogy that makes the concept tangible"
  },
  "quizzes": [
    {
      "format": "multipleChoice" | "trueFalse" | "shortAnswer" | "freeText" | "fillBlank" | "ordering",
      "prompt": "string — the question text",
      "options": ["string"] | null,
      "blankedSentence": "string | null — only for fillBlank",
      "items": ["string"] | null — only for ordering",
      "correctAnswer": "string — correct answer (or ordered items joined by ' > ')",
      "acceptableAnswers": ["string"] | null — alternative correct answers",
      "rationale": "string — brief explanation of the correct answer"
    }
  ]
}

Rules for Quizzes:
- Vary formats. Do NOT use the same format twice in a row.
- For "multipleChoice", provide exactly 4 options.
- For "trueFalse", provide exactly 2 options: ["True", "False"].
- Questions must be self-contained.
- Output ONLY valid JSON. No markdown fences, no extra text.`;
}

export function buildContentUserMessage(concept: { id: string; title: string; explanation: string }): string {
  return `Expand and create quizzes for this concept:\n\n${JSON.stringify(concept, null, 2)}`;
}
