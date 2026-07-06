import { AuthError, RateLimitError, NetworkError } from './errors';
import { getProviderConfig, getApiBase } from './providers';
import type { ChatMessage, LlmProvider } from '@/shared/types';

export interface ChatOptions {
  model?: string;
  apiKey: string;
  provider?: LlmProvider;
  temperature?: number;
  responseFormat?: 'json';
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResponse> {
  const { apiKey, signal: userSignal, responseFormat, maxTokens = 4096 } = opts;
  const provider = opts.provider ?? 'mistral';
  const cfg = getProviderConfig(provider);
  const model = opts.model ?? cfg.defaultModel;
  const temperature = opts.temperature ?? 0.3;
  const apiBase = getApiBase(provider);

  const modelsToTry = model === cfg.defaultModel ? [cfg.defaultModel, cfg.fallbackModel] : [model];
  const MAX_RETRIES = 3;

  for (const currentModel of modelsToTry) {
    const body: Record<string, unknown> = {
      model: currentModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    if (responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const timeoutMs = 60_000;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        const ac = new AbortController();
        const combinedSignal = anySignal(userSignal, AbortSignal.timeout(timeoutMs), ac.signal);

        const res = await fetch(apiBase, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: combinedSignal,
        });

        if (res.status === 401 || res.status === 403) throw new AuthError();

        if (res.status === 429 || res.status >= 500) {
          if (attempt >= MAX_RETRIES) {
            if (currentModel === modelsToTry[modelsToTry.length - 1]) {
              throw res.status === 429 ? new RateLimitError() : new NetworkError(`${cfg.label} returned ${res.status}`);
            }
            break;
          }
          const delay = 1000 * Math.pow(2, attempt);
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!res.ok) {
          if (currentModel === modelsToTry[modelsToTry.length - 1]) throw new NetworkError(`${cfg.label} returned ${res.status}`);
          break;
        }

        const json = await res.json() as {
          choices: { message: { content: string } }[];
          model: string;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const content = json.choices?.[0]?.message?.content ?? '';
        return {
          content,
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
        if (err instanceof AuthError) throw err;
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        if (attempt >= MAX_RETRIES) {
          if (currentModel === modelsToTry[modelsToTry.length - 1]) {
            throw new NetworkError(err instanceof Error ? err.message : 'Unknown fetch error');
          }
          break;
        }

        const delay = 1000 * Math.pow(2, attempt);
        await sleep(delay);
        attempt++;
      }
    }
  }

  throw new NetworkError('All models exhausted');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig) {
      if (sig.aborted) {
        controller.abort(sig.reason);
        return controller.signal;
      }
      sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
    }
  }
  return controller.signal;
}
