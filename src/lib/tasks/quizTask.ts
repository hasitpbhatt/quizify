import type { PromptTask } from '@/lib/llm/promptTask';
import type { QuizItem } from '@/lib/llm/contentParser';
import { parseQuizResponse } from '@/lib/llm/quizParser';
import { buildQuizSystemPrompt, buildQuizUserMessage } from '@/lib/prompts/quiz';

export const quizTask: PromptTask<QuizItem[]> = {
  id: 'quiz',
  buildSystem: (persona, ctx) => buildQuizSystemPrompt(persona, ctx.topic as string),
  buildUser: (input) =>
    buildQuizUserMessage(
      input as { id: string; title: string; explanation: string; example: string },
    ),
  parse: parseQuizResponse,
  responseFormat: 'json',
  maxTokens: 1200,
  temperature: 0.4,
  timeoutMs: 30_000,
};
