import type { EventContext } from 'cloudflare:workers';

const ALLOWED_HOSTS = new Set([
  'blinkist.com',
  'jamesclear.com',
  'getabstracts.com',
  'wikipedia.org',
  'en.wikipedia.org',
]);

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname) || hostname.endsWith('.wikipedia.org');
}

function isPrivateIp(hostname: string): boolean {
  try {
    const parts = hostname.split('.');
    const first = parseInt(parts[0], 10);
    if (first === 10) return true;
    if (first === 172 && parts.length >= 2) {
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    if (first === 192 && parts.length >= 2 && parts[1] === '168') return true;
    if (first === 127) return true;
    return false;
  } catch {
    return false;
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function searchExa(title: string, author: string | null, signal: AbortSignal): Promise<string | null> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;

  const query = author ? `${title} ${author} book summary` : `${title} book summary`;

  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        numResults: 3,
        type: 'auto',
        useAutoprompt: true,
      }),
      signal,
    });

    if (!res.ok) return null;

    const data = await res.json();
    const contents = data.results
      ?.filter((r: { text: string }) => r.text && r.text.length > 100)
      ?.map((r: { text: string }) => r.text)
      ?.join('\n\n');

    return contents || null;
  } catch {
    return null;
  }
}

export async function onRequest(context: EventContext): Promise<Response> {
  const { request } = context;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const title = url.searchParams.get('title');
  const author = url.searchParams.get('author');

  if (!title) {
    return new Response('Missing title parameter', { status: 400 });
  }

  const titleSlug = slugify(title);
  const authorSlug = author ? slugify(author) : '';

  const candidates: string[] = [];

  if (authorSlug) {
    candidates.push(
      `https://blinkist.com/en/books/${authorSlug}/${titleSlug}`,
      `https://jamesclear.com/books/${titleSlug}`,
    );
  }

  candidates.push(
    `https://blinkist.com/en/books/${titleSlug}`,
    `https://jamesclear.com/books/${titleSlug}`,
    `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const results = await Promise.allSettled(
      candidates.map(async (candidate) => {
        const host = new URL(candidate).hostname;
        if (!isAllowedHost(host)) return null;
        if (isPrivateIp(host)) return null;

        const res = await fetch(candidate, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Quizify/1.0 (research tool)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });

        if (!res.ok) return null;
        const text = await res.text();
        return text.length > 300 ? text : null;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        clearTimeout(timeout);
        return new Response(result.value, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    const exaResult = await searchExa(title, author, controller.signal);
    if (exaResult) {
      clearTimeout(timeout);
      return new Response(exaResult, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    clearTimeout(timeout);
    return new Response('No book summary found', { status: 404 });
  } catch (err) {
    clearTimeout(timeout);
    return new Response(
      `Book summary search failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      { status: 502 },
    );
  }
}