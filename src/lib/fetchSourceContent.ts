import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { getProviderConfig, getApiBase } from '@/lib/llm/providers';
import type { LlmProvider, Persona } from '@/shared/types';

const OPENCODE_HEADERS: Record<string, string> = {
  'User-Agent': 'opencode/1.17.13 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
  'x-opencode-client': 'cli',
  'x-opencode-project': 'global',
};

export interface SourceResult {
  content: string;
  source: 'cache' | 'jina' | 'allorigins' | 'corsproxy' | 'corseu' | 'codetabs' | 'corslol' | 'corsfix' | 'cfproxy' | 'llm';
  url: string;
}

export function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  const hasDot = trimmed.includes('.');
  const hasPath = trimmed.includes('/');
  const hasSpace = trimmed.includes(' ');
  if (hasSpace) return false;
  return hasDot || hasPath;
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

async function fetchViaCfProxy(url: string): Promise<Response> {
  return fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
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
  const cfg = getProviderConfig(provider);
  const apiBase = getApiBase(provider);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cfg.defaultBearerToken ? OPENCODE_HEADERS : {}),
  };
  const bearer = cfg.defaultBearerToken ?? (cfg.requiresApiKey ? apiKey : undefined);
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const res = await fetch(apiBase, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.gradingModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${cfg.label} returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const json = await res.json() as { choices: { message: { content: string } }[] };
  return json.choices?.[0]?.message?.content ?? '';
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
  } else {
    // Subject path: go straight to LLM
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
