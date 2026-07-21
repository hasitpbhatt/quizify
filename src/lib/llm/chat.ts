import { AuthError, RateLimitError, NetworkError } from './errors';
import { getDefaultModel, getFallbackModel, getApiBase } from './providers';
import { sleep } from './sleep';
import { countCall } from '@/lib/perf';
import { debugLog } from '@/lib/debug';
import { anySignal, timeoutSignal } from './utils';
import type { ChatMessage } from '@/shared/types';

async function extractErrorBody(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.text();
    try { const e = JSON.parse(body); if (e.error) detail = `: ${String(e.error).slice(0, 300)}`; } catch { if (body && body.length < 300) detail = `: ${body}`; }
  } catch {}
  return detail;
}

export interface RetryInfo {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  status?: number;
  model: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  responseFormat?: 'json';
  signal?: AbortSignal;
  maxTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
  onRetry?: (info: RetryInfo) => void;
  onToken?: (delta: string) => void;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY = 1500;
const TIMEOUT_MS = 60_000;
const MAX_CALL_DEADLINE_MS = 90_000;

async function tryEndpoint(
  messages: ChatMessage[],
  opts: {
    responseFormat?: 'json';
    userSignal?: AbortSignal;
    maxTokens: number;
    temperature: number;
    model?: string;
    onRetry?: (info: RetryInfo) => void;
    onToken?: (delta: string) => void;
    maxRetries: number;
    startTime: number;
    timeoutMs: number;
  },
): Promise<ChatResponse | null> {
  const { userSignal, responseFormat, maxTokens, model: userModel, onRetry, onToken, maxRetries, startTime, timeoutMs } = opts;
  const apiBase = getApiBase();
  const models = userModel
    ? [userModel]
    : [getDefaultModel(), getFallbackModel()].filter((m, i, arr) => m && arr.indexOf(m) === i);
  const label = 'Mistral';

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    if (responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      const elapsed = Date.now() - startTime;
      const remaining = MAX_CALL_DEADLINE_MS - elapsed;
      if (remaining <= 0) throw new NetworkError(`Total deadline exceeded for ${label}`);

      try {
        const perAttemptMs = Math.min(timeoutMs, remaining);
        const ac = new AbortController();
        const signal = anySignal(userSignal, timeoutSignal(perAttemptMs), ac.signal);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (onToken) {
          body.stream = true;
        }

        countCall();
        debugLog('log', 'llm', 'POST %s model=%s format=%s attempt=%d/%d', label, model, responseFormat ?? 'text', attempt, maxRetries);

        const res = await fetch(apiBase, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (res.status === 401 || res.status === 403) throw new AuthError();

        if (res.status === 429 || res.status >= 500) {
          if (attempt >= maxRetries) {
            if (model === models[models.length - 1]) {
              const detail = await extractErrorBody(res);
              throw res.status === 429 ? new RateLimitError() : new NetworkError(`${label} returned ${res.status}${detail}`);
            }
            break;
          }

          let delay = BASE_DELAY * Math.pow(2, attempt);
          const retryAfter = res.headers.get('retry-after');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) delay = parsed * 1000;
          }
          const jitter = 0.5 + Math.random() * 0.5;
          delay = Math.round(delay * jitter);

          onRetry?.({ attempt, maxRetries, delayMs: delay, status: res.status, model });
          debugLog('warn', 'llm', 'retry %d/%d status=%d delay=%dms model=%s', attempt, maxRetries, res.status, delay, model);
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!res.ok) {
          const detail = await extractErrorBody(res);
          if (model === models[models.length - 1]) throw new NetworkError(`${label} returned ${res.status}${detail}`);
          break;
        }

        if (onToken) {
          const content = await readStream(res, onToken);
          return { content, model, usage: undefined };
        }

        const json = await res.json() as {
          choices: { message: { content: string } }[];
          model: string;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const elapsed = Date.now() - startTime;
        const u = json.usage;
        debugLog('log', 'llm', 'chat ok model=%s tokens=%d/%d/%d elapsed=%dms', json.model, u?.prompt_tokens ?? 0, u?.completion_tokens ?? 0, u?.total_tokens ?? 0, elapsed);

        return {
          content: json.choices?.[0]?.message?.content ?? '',
          model: json.model,
          usage: json.usage
            ? {
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens,
                totalTokens: json.usage.total_tokens,
              }
            : undefined,
        };
      } catch (err) {
        if (err instanceof AuthError) { debugLog('error', 'llm', 'chat error AuthError model=%s', model); throw err; }
        if (err instanceof NetworkError) { debugLog('error', 'llm', 'chat error NetworkError model=%s', model); throw err; }
        if (err instanceof RateLimitError) { debugLog('error', 'llm', 'chat error RateLimitError model=%s', model); throw err; }
        if (err instanceof DOMException && err.name === 'AbortError') { debugLog('warn', 'llm', 'chat abort model=%s', model); throw err; }

        if (attempt >= maxRetries) {
          if (model === models[models.length - 1]) {
            return null;
          }
          break;
        }

        let delay = BASE_DELAY * Math.pow(2, attempt);
        const jitter = 0.5 + Math.random() * 0.5;
        delay = Math.round(delay * jitter);

        onRetry?.({ attempt, maxRetries, delayMs: delay, model });
        debugLog('warn', 'llm', 'retry %d/%d status=? delay=%dms model=%s', attempt, maxRetries, delay, model);
        await sleep(delay);
        attempt++;
      }
    }
  }

  return null;
}

async function readStream(res: Response, onToken: (delta: string) => void): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    onToken(text);
    return text;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return full;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  return full;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResponse> {
  const { signal: userSignal, responseFormat, maxTokens = 4096, timeoutMs = TIMEOUT_MS } = opts;
  const model = opts.model ?? getDefaultModel();
  const temperature = opts.temperature ?? 0.3;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const startTime = Date.now();

  const shared = { userSignal, responseFormat, maxTokens, temperature, model, onRetry: opts.onRetry, onToken: opts.onToken, maxRetries, startTime, timeoutMs };

  const msgChars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
  debugLog('log', 'llm', 'chat start model=%s msgs=%d chars=%d', model, messages.length, msgChars);

  const result = await tryEndpoint(messages, shared);
  if (result !== null) return result;

  throw new NetworkError('All endpoints exhausted');
}


