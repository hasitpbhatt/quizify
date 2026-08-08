import { truncateByParagraphs } from '@/lib/truncate';
import { getCachedSourceEntry, setCachedSource } from '@/lib/db/sourceCache';
import { chat } from '@/lib/llm/chat';
import { fetchSourceWithWebSearch } from '@/lib/llm/agents';
import { debugLog } from '@/lib/debug';
import { anySignal } from '@/lib/llm/utils';
import type { Persona, SourceProvenance } from '@/shared/types';
import type { AgentCitation } from '@/lib/llm/agents';

export interface SourceResult {
  content: string;
  source: 'cache' | 'cfproxy' | 'agent' | 'llm';
  provenance: SourceProvenance;
  url: string;
  citations?: AgentCitation[];
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

/**
 * Cheap sanity check for cached/proxied payloads. The cf proxy legitimately
 * returns raw HTML articles, so this must NOT reject every HTML document — it
 * rejects known SPA-shell/bot-interstitial markers, or HTML with almost no
 * visible text (our own dev SPA fallback serves index.html on a 200).
 */
const SHELL_MARKERS = [
  '<div id="root"',
  "<div id='root'",
  '<div id=root',
  'cf-browser-verification',
  'just a moment...',
  'attention required! | cloudflare',
  'enable javascript and cookies to continue',
  'checking your browser before accessing',
];
const MIN_VISIBLE_TEXT_CHARS = 500;

export function isLikelyHtmlShell(content: string): boolean {
  const head = content.slice(0, 4000).toLowerCase();
  if (SHELL_MARKERS.some((marker) => head.includes(marker))) return true;

  const looksLikeHtmlDocument =
    head.includes('<!doctype html') || head.includes('<html') || head.includes('<body');
  if (!looksLikeHtmlDocument) return false;

  const visibleText = content
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return visibleText.length < MIN_VISIBLE_TEXT_CHARS;
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

async function fetchViaViteProxy(url: string, signal?: AbortSignal): Promise<Response> {
  return fetchWithTimeout(`${DEV_PROXY}${encodeURIComponent(url)}`, { signal });
}

async function fetchViaCfProxy(url: string, signal?: AbortSignal): Promise<Response> {
  return fetchWithTimeout(`/api/fetch?url=${encodeURIComponent(url)}`, { signal });
}

async function raceProxies(
  url: string,
  signal?: AbortSignal,
): Promise<{ content: string; source: SourceResult['source'] } | null> {
  const absolute = url.startsWith('http') ? url : `https://${url}`;

  const isShell = (text: string, label: string): boolean => {
    if (isLikelyHtmlShell(text)) {
      debugLog('warn', 'fetch', '%s returned an HTML shell — discarding', label);
      return true;
    }
    return false;
  };

  debugLog('log', 'fetch', 'proxy start url=%s', absolute);

  if (import.meta.env.DEV) {
    try {
      const res = await fetchViaViteProxy(absolute, signal);
      if (res.ok) {
        const text = await res.text();
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (text.length > 200 && !isShell(text, 'vite proxy')) {
          debugLog('log', 'fetch', 'vite proxy OK len=%d', text.length);
          return { content: text, source: 'cfproxy' };
        }
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      debugLog('warn', 'fetch', 'vite proxy failed');
    }
  }

  try {
    const res = await fetchViaCfProxy(absolute, signal);
    if (res.ok) {
      const text = await res.text();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (text.length > 200 && !isShell(text, 'cf proxy')) {
        debugLog('log', 'fetch', 'cf proxy OK len=%d', text.length);
        return { content: text, source: 'cfproxy' };
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    debugLog('warn', 'fetch', 'cf proxy failed');
  }

  return null;
}

async function callLlm(prompt: string, signal?: AbortSignal): Promise<string> {
  const response = await chat([{ role: 'user', content: prompt }], {
    maxTokens: 4000,
    temperature: 0.3,
    signal,
  });
  return response.content;
}

async function fetchSubjectFromLlm(subject: string, signal?: AbortSignal): Promise<string> {
  const prompt =
    `You are a research assistant. The user wants to learn about "${subject}". ` +
    `Produce a detailed educational overview covering: key definitions, core concepts, ` +
    `important examples, common pitfalls, and real-world applications. ` +
    `Output only the content, no disclaimers. Format in clear paragraphs with section headers.`;
  return callLlm(prompt, signal);
}

async function fetchBookSummary(url: string, signal?: AbortSignal): Promise<string> {
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
  const requestSignal = signal ? anySignal(signal, abortController.signal) : abortController.signal;

  const promises = summarySites.map(async (site) => {
    try {
      const response = await fetchTimeout(site, {
        headers: {
          'User-Agent': 'Quizify/1.0 (research tool)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: requestSignal,
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
  } catch (err) {
    if (signal?.aborted) throw err;
    debugLog('warn', 'fetch', 'book-summary failed to fetch any site');
  }

  return '';
}

function isBookTitle(input: string): boolean {
  // No /i flag: the [A-Z] classes are the whole point — this must only match
  // Title Case ("Atomic Habits by James Clear"), not ordinary lowercase topics
  // like "learning by doing" or "async - await", which belong on the web_search path.
  return /^(?:[A-Z][a-zA-Z0-9\s]*\s+by\s+[A-Z][a-zA-Z0-9\s]*|(?:[A-Z][a-zA-Z0-9\s]+)\s*-\s*[A-Z][a-zA-Z0-9\s]+)$/.test(
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
    if (isLikelyHtmlShell(cached.content)) {
      // Poisoned entry (SPA shell / bot interstitial). Treat as a MISS rather
      // than serving garbage for the rest of the 24h TTL.
      debugLog('warn', 'fetch', 'cache POISONED (html shell) url=%s — re-fetching', input);
    } else {
      debugLog('log', 'fetch', 'cache HIT url=%s len=%d', input, cached.content.length);
      return {
        content: cached.content,
        source: 'cache',
        provenance: cached.provenance ?? 'legacy-unknown',
        url: input,
        citations: cached.citations,
      };
    }
  }

  let content: string | null = null;
  let source: SourceResult['source'] | null = null;
  let citations: AgentCitation[] | undefined;

  const subject = isLikelyUrl(input) ? extractSubjectFromUrl(input) : input;

  // Web search (agents) is the primary grounding path. It replaces the raw-URL
  // fetch when possible; the proxy chain below remains as a fallback.
  if (!content && !isBookTitle(input)) {
    try {
      debugLog('log', 'fetch', 'agent web_search subject=%s', subject.slice(0, 100));
      const result = await fetchSourceWithWebSearch(subject, { signal: opts.signal });
      if (result.content && result.content.length >= 50) {
        content = result.content;
        source = 'agent';
        citations = result.citations;
        debugLog(
          'log',
          'fetch',
          'agent web_search OK len=%d citations=%d',
          content.length,
          citations.length,
        );
      } else {
        debugLog('warn', 'fetch', 'agent web_search returned empty/too-short content');
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      debugLog(
        'warn',
        'fetch',
        'agent web_search failed: %s',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (!content) {
    if (isLikelyUrl(input)) {
      const fallback = await raceProxies(input, opts.signal);
      if (fallback) {
        content = fallback.content;
        source = fallback.source;
        debugLog('log', 'fetch', 'proxy OK source=%s len=%d', source, content.length);
      } else {
        debugLog('warn', 'fetch', 'proxy failed');
      }
    }
  }

  if (!content) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    if (isBookTitle(input)) {
      debugLog('log', 'fetch', 'book-title detected, trying summary sites');
      const bookContent = await fetchBookSummary(input, opts.signal);
      if (bookContent && bookContent.length > 50) {
        content = bookContent;
        source = 'cfproxy';
      }
    }

    if (!content) {
      debugLog('warn', 'fetch', 'LLM subject_fallback subject=%s', subject.slice(0, 100));
      try {
        content = await fetchSubjectFromLlm(subject, opts.signal);
        source = 'llm';
      } catch (err) {
        // A user cancel is not a generation failure — never mask it.
        if (opts.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          throw err;
        }
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

  // Agent web search is grounded content with citations, so it must not raise
  // App.tsx's "we couldn't read the page" trust checkpoint. Only the true LLM
  // fallback stays 'topic-generated'.
  const provenance: SourceProvenance =
    source === 'cfproxy' || source === 'agent' ? 'fetched' : 'topic-generated';
  if (opts.signal?.aborted) {
    // A cancelled run must not seed the cache; otherwise a retry silently
    // returns the cancelled run's content.
    debugLog('warn', 'fetch', 'aborted before cache write — skipping cache write url=%s', input);
  } else {
    await setCachedSource(input, truncated, provenance, citations);
  }

  return { content: truncated, source: source ?? 'llm', provenance, url: input, citations };
}
