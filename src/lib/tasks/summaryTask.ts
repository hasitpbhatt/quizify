import type { PromptTask } from '@/lib/llm/promptTask';
import { parseSummaryResponse, type SummaryResponse } from '@/lib/llm/summaryParser';
import { buildSummarySystemPrompt, buildSummaryUserMessage } from '@/lib/prompts/summary';

export const summaryTask: PromptTask<SummaryResponse> = {
  id: 'summary',
  buildSystem: (persona, ctx) => buildSummarySystemPrompt(persona, ctx.topic as string),
  buildUser: (input) =>
    buildSummaryUserMessage(
      input as Array<{ id: string; title: string; explanation: string; example: string }>,
    ),
  parse: parseSummaryResponse,
  responseFormat: 'json',
  maxTokens: 900,
  temperature: 0.4,
  timeoutMs: 30_000,
};
