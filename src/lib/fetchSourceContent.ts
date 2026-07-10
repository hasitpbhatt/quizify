import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { chat } from '@/lib/llm/chat';
import type { LlmProvider, Persona } from '@/shared/types';

export interface SourceResult {
  content: string;
  source: 'cache' | 'jina' | 'allorigins' | 'corsproxy' | 'corseu' | 'codetabs' | 'corslol' | 'corsfix' | 'cfproxy' | 'llm';
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

const JINA_BASE = 'https://r.jina.ai';
const FETCH_TIMEOUT_MS = 15_000;

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

async function fetchViaJina(url: string, jinaToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'text/markdown',
  };
  if (jinaToken) {
    headers.Authorization = `Bearer ${jinaToken}`;
  }
  return fetchWithTimeout(`${JINA_BASE}/${url}`, { headers });
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

async function fetchViaFallbacks(url: string): Promise<{ content: string; source: SourceResult['source'] } | null> {
  const absolute = url.startsWith('http') ? url : `https://${url}`;

  if (import.meta.env.DEV) {
    try {
      const res = await fetchViaViteProxy(absolute);
      if (res.ok) {
        const text = await res.text();
        if (text.length > 200) {
          return { content: text, source: 'jina' };
        }
      }
    } catch {
      // fall through
    }
  }

  const proxies: { prefix: string; label: SourceResult['source'] }[] = [
    { prefix: 'https://api.allorigins.win/raw?url=', label: 'allorigins' },
    { prefix: 'https://corsproxy.io/?', label: 'corsproxy' },
    { prefix: 'https://cors.eu.org/', label: 'corseu' },
    { prefix: 'https://api.codetabs.com/v1/proxy/?quest=', label: 'codetabs' },
    { prefix: 'https://cors.lol/', label: 'corslol' },
    { prefix: 'https://api.corsfix.com/proxy?url=', label: 'corsfix' },
  ];

  const results = await Promise.allSettled(
    proxies.map(async (proxy) => {
      const res = await fetchViaProxy(absolute, proxy.prefix);
      if (!res.ok) throw new Error(`${proxy.label} returned ${res.status}`);
      const text = await res.text();
      if (text.length <= 200) throw new Error(`${proxy.label} returned too little content`);
      return { content: text, source: proxy.label };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      return result.value;
    }
  }

  try {
    const res = await fetchViaCfProxy(absolute);
    if (res.ok) {
      const text = await res.text();
      if (text.length > 200) {
        return { content: text, source: 'cfproxy' };
      }
    }
  } catch {
    // fall through
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
  opts: { apiKey: string; jinaToken?: string; persona: Persona; provider?: LlmProvider }
): Promise<SourceResult> {
  const cached = await getCachedSource(input);
  if (cached) {
    return { content: cached, source: 'cache', url: input };
  }

  let content: string | null = null;
  let source: SourceResult['source'] | null = null;

  if (isLikelyUrl(input)) {
    // URL path: cache → Jina → proxies → LLM
    try {
      const res = await fetchViaJina(input, opts.jinaToken);
      if (res.ok) {
        content = await res.text();
        source = 'jina';
      }
    } catch {
      // fall through
    }

    if (!content) {
      const fallback = await fetchViaFallbacks(input);
      if (fallback) {
        content = fallback.content;
        source = fallback.source;
      }
    }

    if (!content) {
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
