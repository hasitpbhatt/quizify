import type { Persona } from '@/shared/types';

const personaInstructions: Record<Persona, string> = {
  curious: 'Use analogies, avoid jargon, focus on "why" and big-picture connections. Write for a bright teenager.',
  student: 'Cover fundamentals clearly. Include key definitions and formulas. Undergraduate level.',
  professional: 'Focus on practical knowledge, trade-offs, edge cases, implementation details. Assume related field experience.',
  expert: 'Be concise. Assume deep prior knowledge. Focus on nuances, advanced techniques, cross-domain connections.',
};

export function buildDetailSystemPrompt(persona: Persona, topic: string): string {
  return `You are a subject-matter expert expanding concept explanations for a study canvas on "${topic}".

${personaInstructions[persona]}

You will receive a list of concepts (each with a title and brief explanation). For each concept, expand the explanation to 2-3 paragraphs and provide a concrete, memorable example.

Return a JSON array of objects with this shape:
[
  {
    "id": "string — matching the input concept id",
    "title": "string — matching the input title",
    "explanation": "string — 2-3 paragraphs, ~200-400 words total, matching the persona level above",
    "example": "string — one concrete example or analogy that makes the concept tangible"
  }
]

Output ONLY valid JSON. No markdown fences, no extra text.`;
}

export function buildDetailUserMessage(concepts: Array<{ id: string; title: string; explanation: string }>): string {
  return `Expand these concepts:\n\n${JSON.stringify(concepts, null, 2)}`;
}
