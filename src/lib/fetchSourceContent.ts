import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSourceEntry, setCachedSource } from '@/lib/db/sourceCache';
import { chat } from '@/lib/llm/chat';
import { debugLog } from '@/lib/debug';
import { anySignal } from '@/lib/llm/utils';
import type { Persona, SourceProvenance } from '@/shared/types';

export interface SourceResult {
  content: string;
  source: 'cache' | 'cfproxy' | 'llm';
  provenance: SourceProvenance;
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
  const timeout = setTimeout(
    () => ac.abort(new DOMException('Fetch timed out', 'TimeoutError')),
    FETCH_TIMEOUT_MS,
  );
  try {
    const signal = init?.signal ? anySignal(init.signal, ac.signal) : ac.signal;
    return await fetch(url, { ...init, signal });
  } finally {
    clearTimeout(timeout);
  }
}

const DEV_PROXY = '/__proxy?url=';

async function fetchViaViteProxy(url: string): Promise<Response> {
  return fetchWithTimeout(`${DEV_PROXY}${encodeURIComponent(url)}`);
}

async function fetchViaCfProxy(url: string): Promise<Response> {
  return fetchWithTimeout(`/api/fetch?url=${encodeURIComponent(url)}`);
}

async function raceProxies(
  url: string,
): Promise<{ content: string; source: SourceResult['source'] } | null> {
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
  const response = await chat([{ role: 'user', content: prompt }], {
    maxTokens: 4000,
    temperature: 0.3,
  });
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

async function fetchBookSummary(url: string): Promise<string> {
  const fetchTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
    const ac = new AbortController();
    const timeout = setTimeout(
      () => ac.abort(new DOMException('Fetch timed out', 'TimeoutError')),
      FETCH_TIMEOUT_MS,
    );
    try {
      const signal = init?.signal ? anySignal(init.signal, ac.signal) : ac.signal;
      return await fetch(url, { ...init, signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  const summarySites = [
    `https://blinkist.com/en/summaries/${encodeURIComponent(url)}`,
    `https://www.getabstracts.com/books/${encodeURIComponent(url)}`,
    `https://jamesclear.com/books/${encodeURIComponent(url)}`,
  ];

  const abortController = new AbortController();
  const promises = summarySites.map(async (site) => {
    try {
      const response = await fetchTimeout(site, {
        headers: {
          'User-Agent': 'Quizify/1.0 (research tool)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: abortController.signal,
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > 300) {
        return text;
      }
      return null;
    } catch {
      return null;
    }
  });

  try {
    const results = await Promise.race([
      Promise.all(promises),
      new Promise<null[]>((_, reject) => setTimeout(() => reject(null), 8000)),
    ]);

    for (const content of results) {
      if (content) {
        debugLog('log', 'fetch', 'book-summary OK len=%d', content.length);
        return content;
      }
    }
  } catch {
    debugLog('warn', 'fetch', 'book-summary failed to fetch any site');
  }

  return '';
}

function isBookTitle(input: string): boolean {
  return /^(?:[A-Z][a-zA-Z0-9\s]*\s+by\s+[A-Z][a-zA-Z0-9\s]*|(?:[A-Z][a-zA-Z0-9\s]+)\s*-\s*[A-Z][a-zA-Z0-9\s]+)$/i.test(
    input.trim(),
  );
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
  opts: { persona: Persona; signal?: AbortSignal },
): Promise<SourceResult> {
  const cached = await getCachedSourceEntry(input);
  if (cached) {
    debugLog('log', 'fetch', 'cache HIT url=%s len=%d', input, cached.content.length);
    return {
      content: cached.content,
      source: 'cache',
      provenance: cached.provenance ?? 'legacy-unknown',
      url: input,
    };
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

    if (isBookTitle(input)) {
      debugLog('log', 'fetch', 'book-title detected, trying summary sites');
      const bookContent = await fetchBookSummary(input);
      if (bookContent && bookContent.length > 50) {
        content = bookContent;
        source = 'cfproxy';
      }
    }

    if (!content) {
      const subject = isLikelyUrl(input) ? extractSubjectFromUrl(input) : input;
      debugLog('warn', 'fetch', 'LLM subject_fallback subject=%s', subject.slice(0, 100));
      try {
        content = await fetchSubjectFromLlm(subject);
        source = 'llm';
      } catch (err) {
        throw new Error(
          `Couldn't generate content for "${input}". ${err instanceof Error ? err.message : 'LLM call failed.'}`,
        );
      }
    }
  }

  if (!content || content.length < 50) {
    throw new Error(`Failed to fetch content from ${input}`);
  }

  const truncated = truncateByParagraphs(content);

  const provenance: SourceProvenance = source === 'cfproxy' ? 'fetched' : 'topic-generated';
  await setCachedSource(input, truncated, provenance);

  return { content: truncated, source: source ?? 'llm', provenance, url: input };
}
