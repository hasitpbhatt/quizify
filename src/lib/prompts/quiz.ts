import type { Persona } from '@/shared/types';

export function buildQuizSystemPrompt(persona: Persona, topic: string): string {
  const level = persona === 'curious' ? 'introductory'
    : persona === 'student' ? 'undergraduate'
    : persona === 'professional' ? 'practitioner'
    : 'advanced';

  return `You are creating quiz questions for a study canvas on "${topic}" at a ${level} level.

You will receive a list of concepts (each with id, title, explanation, and example). For EACH concept, generate 3-5 quiz questions that test understanding of that concept.

Quiz formats available:
- "multipleChoice": 4 options, one correct
- "trueFalse": exactly 2 options (True / False), one correct
- "shortAnswer": brief written answer (1-2 sentences)
- "freeText": open-ended response (describe what to look for in answer)
- "fillBlank": sentence with a blank marked by ___
- "ordering": list of items that need to be ordered correctly

Return a JSON object with this shape:
{
  "quizzes": [
    {
      "conceptId": "string — matching the input concept id",
      "items": [
        {
          "format": "multipleChoice" | "trueFalse" | "shortAnswer" | "freeText" | "fillBlank" | "ordering",
          "prompt": "string — the question text",
          "options": ["string"] | null,
          "blankedSentence": "string | null — only for fillBlank",
          "items": ["string"] | null — only for ordering",
          "correctAnswer": "string — correct answer",
          "acceptableAnswers": ["string"] | null — alternative correct answers",
          "rationale": "string — brief explanation of the correct answer"
        }
      ]
    }
  ]
}

Rules:
- Vary quiz formats within each concept.
- Do NOT use the same format twice in a row.
- For "multipleChoice", provide exactly 4 options.
- For "trueFalse", provide exactly 2 options: ["True", "False"].
- For "ordering", set "correctAnswer" to the correct order joined by " > ".
- Questions should be self-contained (no need to reference external material).
- Output ONLY valid JSON. No markdown fences, no extra text.`;
}

export function buildQuizUserMessage(concepts: Array<{ id: string; title: string; explanation: string; example: string }>): string {
  return `Generate quizzes for these concepts:\n\n${JSON.stringify(concepts, null, 2)}`;
}
