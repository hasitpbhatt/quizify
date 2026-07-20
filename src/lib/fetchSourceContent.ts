import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { chat } from '@/lib/llm/chat';
import { debugLog } from '@/lib/debug';
import type { LlmProvider, Persona } from '@/shared/types';

export interface SourceResult {
  content: string;
  source: 'cache' | 'cfproxy' | 'llm';
  url: string;
}

export function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.includes(' ')) return false;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    const host = url.hostname;
    if (!host.includes('.')) return false;
    const parts = host.split('.');
    const tld = parts[parts.length - 1];
    if (/^(js|jsx|ts|tsx)$/i.test(tld)) return false;
    if (/^\d+$/.test(tld)) return false;
    return true;
  } catch {
    return false;
  }
}

const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(new DOMException('Fetch timed out', 'TimeoutError')), FETCH_TIMEOUT_MS);
  try {
    const signal = init?.signal ? anySignal(init.signal, ac.signal) : ac.signal;
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timeout);
  }
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

const DEV_PROXY = '/__proxy?url=';

async function fetchViaViteProxy(url: string): Promise<Response> {
  return fetchWithTimeout(`${DEV_PROXY}${encodeURIComponent(url)}`);
}

async function fetchViaCfProxy(url: string): Promise<Response> {
  return fetchWithTimeout(`/api/fetch?url=${encodeURIComponent(url)}`);
}

async function raceProxies(url: string): Promise<{ content: string; source: SourceResult['source'] } | null> {
  const absolute = url.startsWith('http') ? url : `https://${url}`;

  debugLog('log', 'fetch', 'proxy start url=%s', absolute);

  // Try the server-side proxy exclusively.
  // In dev: Vite dev middleware at /api/fetch (and /__proxy as fallback).
  // In prod: Cloudflare Function at /api/fetch.
  // Server-to-server requests have no CORS restrictions.
  if (import.meta.env.DEV) {
    try {
      const res = await fetchViaViteProxy(absolute);
      if (res.ok) {
        const text = await res.text();
        if (text.length > 200) {
          debugLog('log', 'fetch', 'vite proxy OK len=%d', text.length);
          return { content: text, source: 'cfproxy' };
        }
      }
    } catch {
      debugLog('warn', 'fetch', 'vite proxy failed');
    }
  }

  try {
    const res = await fetchViaCfProxy(absolute);
    if (res.ok) {
      const text = await res.text();
      if (text.length > 200) {
        debugLog('log', 'fetch', 'cf proxy OK len=%d', text.length);
        return { content: text, source: 'cfproxy' };
      }
    }
  } catch {
    debugLog('warn', 'fetch', 'cf proxy failed');
  }

  return null;
}

async function callLlm(prompt: string, apiKey: string, provider?: LlmProvider): Promise<string> {
  const response = await chat(
    [{ role: 'user', content: prompt }],
    { apiKey, provider, maxTokens: 4000, temperature: 0.3 },
  );
  return response.content;
}

async function fetchSubjectFromLlm(subject: string, apiKey: string, provider?: LlmProvider): Promise<string> {
  const prompt =
    `You are a research assistant. The user wants to learn about "${subject}". ` +
    `Produce a detailed educational overview covering: key definitions, core concepts, ` +
    `important examples, common pitfalls, and real-world applications. ` +
    `Output only the content, no disclaimers. Format in clear paragraphs with section headers.`;
  return callLlm(prompt, apiKey, provider);
}

export async function fetchSourceContent(
  input: string,
  opts: { apiKey: string; persona: Persona; provider?: LlmProvider; signal?: AbortSignal }
): Promise<SourceResult> {
  const cached = await getCachedSource(input);
  if (cached) {
    debugLog('log', 'fetch', 'cache HIT url=%s len=%d', input, cached.length);
    return { content: cached, source: 'cache', url: input };
  }

  let content: string | null = null;
  let source: SourceResult['source'] | null = null;

  if (isLikelyUrl(input)) {
    const fallback = await raceProxies(input);
    if (fallback) {
      content = fallback.content;
      source = fallback.source;
      debugLog('log', 'fetch', 'proxy OK source=%s len=%d', source, content.length);
    } else {
      debugLog('warn', 'fetch', 'proxy race FAILED');
    }

    if (!content) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      debugLog('warn', 'fetch', 'LLM URL_fallback url=%s', input.slice(0, 100));
      try {
        content = await callLlm(
          `Summarize the content found at ${input.startsWith('http') ? input : `https://${input}`}. ` +
          `Focus on educational value — definitions, explanations, examples, code snippets if applicable.`,
          opts.apiKey,
          opts.provider,
        );
        source = 'llm';
      } catch {
        // fall through
      }
    }
  }

  // Fallback: if URL fetching failed (or input was not a URL), treat as subject
  if (!content) {
    debugLog('warn', 'fetch', 'LLM subject_fallback input=%s', input.slice(0, 100));
    try {
      content = await fetchSubjectFromLlm(input, opts.apiKey, opts.provider);
      source = 'llm';
    } catch (err) {
      throw new Error(
        `Couldn't generate content for "${input}". ${err instanceof Error ? err.message : 'LLM call failed.'}`
      );
    }
  }

  if (!content || content.length < 50) {
    throw new Error(`Failed to fetch content from ${input}`);
  }

  const truncated = truncateByParagraphs(content);

  setCachedSource(input, truncated);

  return { content: truncated, source: source ?? 'llm', url: input };
}
