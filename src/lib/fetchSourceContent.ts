import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { getProviderConfig, getApiBase } from '@/lib/llm/providers';
import type { LlmProvider, Persona } from '@/shared/types';

export interface SourceResult {
  content: string;
  source: 'cache' | 'jina' | 'allorigins' | 'corsproxy' | 'corseu' | 'llm';
  url: string;
}

const JINA_BASE = 'https://r.jina.ai';

async function fetchViaJina(url: string, jinaToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'text/markdown',
  };
  if (jinaToken) {
    headers.Authorization = `Bearer ${jinaToken}`;
  }
  return fetch(`${JINA_BASE}/${url}`, { headers });
}

async function fetchViaProxy(url: string, proxy: string): Promise<Response> {
  const proxyUrl = proxy.endsWith('/') ? `${proxy}${url}` : `${proxy}/${url}`;
  return fetch(proxyUrl);
}

const DEV_PROXY = '/__proxy?url=';

async function fetchViaViteProxy(url: string): Promise<Response> {
  return fetch(`${DEV_PROXY}${encodeURIComponent(url)}`);
}

async function fetchViaFallbacks(url: string): Promise<{ content: string; source: SourceResult['source'] } | null> {
  const absolute = url.startsWith('http') ? url : `https://${url}`;

  // In dev mode, use Vite's built-in proxy (avoids CORS)
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
  ];

  for (const proxy of proxies) {
    try {
      const absolute = url.startsWith('http') ? url : `https://${url}`;
      const res = await fetchViaProxy(absolute, proxy.prefix);
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 200) {
        return { content: text, source: proxy.label };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function fetchSourceContent(
  url: string,
  opts: { apiKey: string; jinaToken?: string; persona: Persona; provider?: LlmProvider }
): Promise<SourceResult> {
  // 1. check cache
  const cached = await getCachedSource(url);
  if (cached) {
    return { content: cached, source: 'cache', url };
  }

  let content: string | null = null;
  let source: SourceResult['source'] | null = null;

  // 2. try Jina
  try {
    const res = await fetchViaJina(url, opts.jinaToken);
    if (res.ok) {
      content = await res.text();
      source = 'jina';
    }
  } catch {
    // fall through
  }

  // 3. try proxy chain
  if (!content) {
    const fallback = await fetchViaFallbacks(url);
    if (fallback) {
      content = fallback.content;
      source = fallback.source;
    }
  }

  // 4. last resort: ask LLM knowledge (only for well-known URLs)
  if (!content) {
    content = await fetchViaLlmKnowledge(url, opts.apiKey, opts.provider);
    source = 'llm';
  }

  if (!content || content.length < 50) {
    throw new Error(`Failed to fetch content from ${url}`);
  }

  const truncated = truncateByParagraphs(content);

  // cache asynchronously (don't await)
  setCachedSource(url, truncated);

  return { content: truncated, source: source ?? 'llm', url };
}

async function fetchViaLlmKnowledge(url: string, apiKey: string, provider?: LlmProvider): Promise<string | null> {
  const targetUrl = url.startsWith('http') ? url : `https://${url}`;
  const cfg = getProviderConfig(provider);
  const apiBase = getApiBase(provider);
  try {
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: cfg.gradingModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a research assistant. Given a URL, return a detailed summary of what the page at that URL covers. Include key facts, definitions, and explanations. Output only the content, no disclaimers.',
          },
          {
            role: 'user',
            content: `Summarize the content found at ${targetUrl}. Focus on educational value — definitions, explanations, examples, code snippets if applicable.`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;

    const json = await res.json() as {
      choices: { message: { content: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
