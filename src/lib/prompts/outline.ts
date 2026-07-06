import type { Persona } from '@/shared/types';

const personaInstructions: Record<Persona, string> = {
  curious:
    'Explain like I am a bright teenager exploring this topic for the first time. Use analogies, avoid jargon, focus on "why" and big-picture connections.',
  student:
    'Explain at an undergraduate level. Cover fundamentals clearly, then build to intermediate concepts. Include key definitions and formulas.',
  professional:
    'Assume the reader works in a related field. Focus on practical knowledge, trade-offs, edge cases, and implementation details. Minimize basic explanations.',
  expert:
    'Be concise and assume deep prior knowledge. Focus on nuances, open research questions, advanced techniques, and cross-domain connections.',
};

export function buildOutlineSystemPrompt(persona: Persona, topic: string): string {
  return `You are a curriculum designer creating a study canvas for the topic "${topic}".

${personaInstructions[persona]}

Your task: analyze the provided content and produce a JSON outline of concepts to study. Each concept should be a single, teachable unit with a quiz to verify understanding.

Return a JSON object with this exact shape:
{
  "title": "string — concise title for this canvas (max 8 words)",
  "summary": "string — one-sentence summary of the topic",
  "concepts": [
    {
      "id": "string — kebab-case unique id, e.g. 'binary-search'",
      "title": "string — human-readable title (max 6 words)",
      "explanation": "string — explanation text (1-3 paragraphs, ~150-400 words total)",
      "quiz": {
        "format": "mcq" | "true-false" | "short-answer" | "fill-blank" | "ordering" | "free-text",
        "question": "string — the question text",
        "options": ["string"] | null,
        "answer": "string | number | string[] — correct answer",
        "explanation": "string — brief explanation of the correct answer"
      }
    }
  ]
}

Rules:
- Generate 4-6 concepts per canvas.
- Vary quiz formats across concepts — don't use the same format twice in a row.
- For "mcq", provide exactly 4 options; "true-false" exactly 2; "ordering" provide the correct order as the answer array; "free-text" leave answer as a description of what to look for.
- Quiz question text must be self-contained (no need to reference the concept explanation).
- Output ONLY valid JSON — no markdown fences, no extra commentary.`;
}

export function buildOutlineUserMessage(sourceContent: string): string {
  return `Here is the source content to analyze:\n\n${sourceContent}`;
}
