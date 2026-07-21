import { chat, type ChatOptions, type RetryInfo } from './chat';
import { ParseError } from './errors';
import { debugLog } from '@/lib/debug';
import type { Persona, ChatMessage } from '@/shared/types';

export interface PromptTask<T> {
  id: string;
  buildSystem(persona: Persona, context: Record<string, unknown>): string;
  buildUser(input: unknown): string;
  parse(raw: string): T;
  responseFormat?: 'json';
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface TaskOptions {
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
    responseFormat: task.responseFormat,
    signal: opts.signal,
    onRetry: opts.onRetry,
    maxTokens: task.maxTokens,
    temperature: task.temperature,
    timeoutMs: task.timeoutMs,
  };
  if (opts.model) chatOpts.model = opts.model;

  for (let attempt = 0; attempt < 2; attempt++) {
    debugLog('log', 'task', 'task %s attempt %d/2 msgs=%d', task.id, attempt + 1, messages.length);
    const res = await chat(messages, chatOpts);
    try {
      return task.parse(res.content);
    } catch (err) {
      debugLog('warn', 'task', 'task %s parse fail attempt %d raw_len=%d snippet=%.200s', task.id, attempt + 1, res.content.length, res.content);
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
        debugLog('error', 'task', 'task %s final raw snippet=%.400s', task.id, res.content);
        throw err;
      }
    }
  }

  debugLog('error', 'task', 'task %s FAILED after retry', task.id);
  throw new ParseError(`Failed to parse ${task.id} response after retry`);
}
