import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { chat } from '@/lib/llm/chat';
import { debugLog } from '@/lib/debug';
import type { LlmProvider, Persona } from '@/shared/types';

export interface SourceResult {
  content: string;
  source: 'cache' | 'allorigins' | 'corsproxy' | 'corseu' | 'codetabs' | 'corslol' | 'corsfix' | 'cfproxy' | 'llm';
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

async function fetchViaProxy(url: string, proxy: string): Promise<Response> {
  const proxyUrl = proxy.endsWith('/') ? `${proxy}${url}` : `${proxy}/${url}`;
  return fetchWithTimeout(proxyUrl);
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

  debugLog('log', 'fetch', 'proxy race start url=%s', absolute);

  const candidates: { runner: () => Promise<{ content: string; source: SourceResult['source'] } | null>; label: string }[] = [];

  if (import.meta.env.DEV) {
    candidates.push({
      label: 'viteproxy',
      runner: async () => {
        const res = await fetchViaViteProxy(absolute);
        if (!res.ok) return null;
        const text = await res.text();
        return text.length > 200 ? { content: text, source: 'allorigins' } : null;
      },
    });
  }

  candidates.push({
    label: 'cfproxy',
    runner: async () => {
      const res = await fetchViaCfProxy(absolute);
      if (!res.ok) return null;
      const text = await res.text();
      return text.length > 200 ? { content: text, source: 'cfproxy' } : null;
    },
  });

  const proxyList: { prefix: string; label: SourceResult['source'] }[] = [
    { prefix: 'https://api.allorigins.win/raw?url=', label: 'allorigins' },
    { prefix: 'https://corsproxy.io/?', label: 'corsproxy' },
    { prefix: 'https://cors.eu.org/', label: 'corseu' },
    { prefix: 'https://api.codetabs.com/v1/proxy/?quest=', label: 'codetabs' },
    { prefix: 'https://cors.lol/', label: 'corslol' },
    { prefix: 'https://api.corsfix.com/proxy?url=', label: 'corsfix' },
  ];

  for (const proxy of proxyList) {
    candidates.push({
      label: proxy.label,
      runner: async () => {
        const res = await fetchViaProxy(absolute, proxy.prefix);
        if (!res.ok) return null;
        const text = await res.text();
        return text.length > 200 ? { content: text, source: proxy.label } : null;
      },
    });
  }

  // Race first 3
  const firstBatch = candidates.slice(0, 3).map(c => c.runner());
  const firstResult = await raceAll(firstBatch);
  if (firstResult) return firstResult;

  if (candidates.length > 3) {
    const restBatch = candidates.slice(3).map(c => c.runner());
    const restResult = await raceAll(restBatch);
    if (restResult) return restResult;
  }

  return null;
}

async function raceAll( runners: Promise<{ content: string; source: SourceResult['source'] } | null>[]): Promise<{ content: string; source: SourceResult['source'] } | null> {
  const results = await Promise.allSettled(runners);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      return result.value;
    }
  }
  return null;
}

async function fetchViaFallbacks(url: string): Promise<{ content: string; source: SourceResult['source'] } | null> {
  return raceProxies(url);
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
    const fallback = await fetchViaFallbacks(input);
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
