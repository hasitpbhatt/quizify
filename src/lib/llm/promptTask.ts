import { chat, type ChatOptions, type RetryInfo } from './chat';
import { ParseError } from './errors';
import type { Persona, LlmProvider, ChatMessage } from '@/shared/types';

export interface PromptTask<T> {
  id: string;
  buildSystem(persona: Persona, context: Record<string, unknown>): string;
  buildUser(input: unknown): string;
  parse(raw: string): T;
  responseFormat?: 'json';
}

export interface TaskOptions {
  apiKey: string;
  provider: LlmProvider;
  persona: Persona;
  signal?: AbortSignal;
  onRetry?: (info: RetryInfo) => void;
  onParseRetry?: (raw: string, error: unknown) => void;
  context?: Record<string, unknown>;
  model?: string;
}

export async function executePromptTask<T>(
  task: PromptTask<T>,
  opts: TaskOptions,
  input: unknown,
): Promise<T> {
  const messages: ChatMessage[] = [
    { role: 'system', content: task.buildSystem(opts.persona, opts.context ?? {}) },
    { role: 'user', content: task.buildUser(input) },
  ];

  const chatOpts: ChatOptions = {
    apiKey: opts.apiKey,
    provider: opts.provider,
    responseFormat: task.responseFormat,
    signal: opts.signal,
    onRetry: opts.onRetry,
  };
  if (opts.model) chatOpts.model = opts.model;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chat(messages, chatOpts);
    try {
      return task.parse(res.content);
    } catch (err) {
      opts.onParseRetry?.(res.content, err);
      if (attempt === 0) {
        messages.push({
          role: 'user',
          content:
            'Your previous response could not be parsed as valid JSON. ' +
            'Return ONLY valid JSON matching the requested schema — ' +
            'no markdown fences, no extra text.',
        });
      } else {
        throw err;
      }
    }
  }

  throw new ParseError(`Failed to parse ${task.id} response after retry`);
}
