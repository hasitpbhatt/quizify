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

const OPENCODE_HEADERS: Record<string, string> = {
  'User-Agent': 'opencode/1.17.13 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
  'x-opencode-client': 'cli',
  'x-opencode-project': 'global',
};

interface EndpointEntry {
  apiBase: string;
  label: string;
  models: string[];
  bearerToken?: string;
  extraHeaders?: Record<string, string>;
}

const MAX_RETRIES = 3;
const BASE_DELAY = 5000;
const TIMEOUT_MS = 60_000;

async function tryEndpoint(
  messages: ChatMessage[],
  entry: EndpointEntry,
  opts: {
    apiKey: string;
    responseFormat?: 'json';
    signal?: AbortSignal;
    maxTokens: number;
    temperature: number;
  },
): Promise<ChatResponse | null> {
  const { apiKey, signal: userSignal, responseFormat, maxTokens } = opts;

  for (const model of entry.models) {
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
    while (attempt <= MAX_RETRIES) {
      try {
        const ac = new AbortController();
        const signal = anySignal(userSignal, AbortSignal.timeout(TIMEOUT_MS), ac.signal);
        const bearer = entry.bearerToken ?? apiKey;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...entry.extraHeaders,
        };
        if (bearer) {
          headers.Authorization = `Bearer ${bearer}`;
        }

        const res = await fetch(entry.apiBase, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (res.status === 401 || res.status === 403) throw new AuthError();

        if (res.status === 429 || res.status >= 500) {
          if (attempt >= MAX_RETRIES) {
            if (model === entry.models[entry.models.length - 1]) {
              throw res.status === 429 ? new RateLimitError() : new NetworkError(`${entry.label} returned ${res.status}`);
            }
            break;
          }
          const delay = BASE_DELAY * Math.pow(2, attempt);
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!res.ok) {
          if (model === entry.models[entry.models.length - 1]) throw new NetworkError(`${entry.label} returned ${res.status}`);
          break;
        }

        const json = await res.json() as {
          choices: { message: { content: string } }[];
          model: string;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

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
        if (err instanceof AuthError) throw err;
        if (err instanceof NetworkError) throw err;
        if (err instanceof RateLimitError) throw err;
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        if (attempt >= MAX_RETRIES) {
          if (model === entry.models[entry.models.length - 1]) {
            return null;
          }
          break;
        }

        const delay = BASE_DELAY * Math.pow(2, attempt);
        await sleep(delay);
        attempt++;
      }
    }
  }

  return null;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResponse> {
  const { apiKey, signal: userSignal, responseFormat, maxTokens = 4096 } = opts;
  const provider = opts.provider ?? 'mistral';
  const cfg = getProviderConfig(provider);
  const model = opts.model ?? cfg.defaultModel;
  const temperature = opts.temperature ?? 0.3;
  const apiBase = getApiBase(provider);

  const shared = { apiKey, userSignal, responseFormat, maxTokens, temperature };

  const modelsToTry = model === cfg.defaultModel ? [cfg.defaultModel, cfg.fallbackModel] : [model];

  const entries: EndpointEntry[] = [
    {
      apiBase,
      label: cfg.label,
      models: modelsToTry.filter(Boolean) as string[],
      bearerToken: cfg.defaultBearerToken,
      extraHeaders: cfg.defaultBearerToken ? OPENCODE_HEADERS : undefined,
    },
  ];

  if (cfg.fallbackApiBase) {
    const fallbackModels = model === cfg.defaultModel
      ? [cfg.fallbackDefaultModel, cfg.fallbackFallbackModel].filter(Boolean) as string[]
      : [model];
    if (fallbackModels.length > 0) {
      entries.push({
        apiBase: cfg.fallbackApiBase,
        label: `${cfg.label} (fallback)`,
        models: fallbackModels,
      });
    }
  }

  for (const entry of entries) {
    const result = await tryEndpoint(messages, entry, shared);
    if (result !== null) return result;
  }

  throw new NetworkError('All endpoints exhausted');
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
