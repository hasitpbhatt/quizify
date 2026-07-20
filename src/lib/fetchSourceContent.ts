import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { chat } from '@/lib/llm/chat';
import { debugLog } from '@/lib/debug';
import type { Persona } from '@/shared/types';

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

async function callLlm(prompt: string): Promise<string> {
  const response = await chat(
    [{ role: 'user', content: prompt }],
    { maxTokens: 4000, temperature: 0.3 },
  );
  return response.content;
}

async function fetchSubjectFromLlm(subject: string): Promise<string> {
  const prompt =
    `You are a research assistant. The user wants to learn about "${subject}". ` +
    `Produce a detailed educational overview covering: key definitions, core concepts, ` +
    `important examples, common pitfalls, and real-world applications. ` +
    `Output only the content, no disclaimers. Format in clear paragraphs with section headers.`;
  return callLlm(prompt);
}

function extractSubjectFromUrl(input: string): string {
  try {
    const url = new URL(input);
    const path = url.pathname.replace(/\/$/, '');
    const lastSegment = path.split('/').filter(Boolean).pop();
    if (lastSegment) {
      return decodeURIComponent(lastSegment.replace(/[_\-]/g, ' '));
    }
    return url.hostname.replace(/^www\./, '');
  } catch {
    return input;
  }
}

export async function fetchSourceContent(
  input: string,
  opts: { persona: Persona; signal?: AbortSignal }
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
      debugLog('warn', 'fetch', 'proxy failed');
    }
  }

  if (!content) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const subject = isLikelyUrl(input) ? extractSubjectFromUrl(input) : input;
    debugLog('warn', 'fetch', 'LLM subject_fallback subject=%s', subject.slice(0, 100));
    try {
      content = await fetchSubjectFromLlm(subject);
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
