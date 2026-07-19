import type { PromptTask } from '@/lib/llm/promptTask';
import type { OutlineData } from '@/lib/llm/outlineParser';
import { buildOutlineSystemPrompt, buildOutlineUserMessage } from '@/lib/prompts/outline';
import { parseOutline } from '@/lib/llm/outlineParser';

export const outlineTask: PromptTask<OutlineData> = {
  id: 'outline',
  buildSystem: (persona, ctx) => buildOutlineSystemPrompt(persona, ctx.url as string),
  buildUser: (input) => buildOutlineUserMessage(input as string),
  parse: parseOutline,
  responseFormat: 'json',
  maxTokens: 1200,
  temperature: 0.2,
};
