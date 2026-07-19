import type { PromptTask } from '@/lib/llm/promptTask';
import { parseContentResponse, type ContentResponse } from '@/lib/llm/contentParser';
import { buildContentSystemPrompt, buildContentUserMessage } from '@/lib/prompts/content';

export const contentTask: PromptTask<ContentResponse> = {
  id: 'content',
  buildSystem: (persona, ctx) => buildContentSystemPrompt(persona, ctx.topic as string),
  buildUser: (input) => buildContentUserMessage(input as { id: string; title: string; explanation: string }),
  parse: parseContentResponse,
  responseFormat: 'json',
  maxTokens: 1600,
  temperature: 0.4,
};
