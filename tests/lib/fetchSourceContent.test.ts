import { fetchSourceContent, isLikelyUrl } from '@/lib/fetchSourceContent';
import { setCachedSource, getCachedSource } from '@/lib/db/sourceCache';
import { getDb, STORES } from '@/lib/db/db';
import { useSettingsStore } from '@/shared/stores/settingsStore';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const LONG = 'A'.repeat(300);
const SHORT = 'short';

function ok(text: string) {
  return { ok: true, status: 200, text: () => Promise.resolve(text), json: () => Promise.resolve({}) };
}

function llmResp(content: string) {
  return {
    ok: true, status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }], model: 't' }),
  };
}

function errStatus(status: number, body?: string) {
  return { ok: false, status, text: () => Promise.resolve(body ?? 'Error') };
}

function urlOf(info: RequestInfo | URL): string {
  return typeof info === 'string' ? info : info.toString();
}

/** Helper: creates a mock fetch that routes based on URL patterns. */
function mockWith(patternMap: Record<string, () => Promise<unknown>>) {
  mockFetch.mockImplementation((info: RequestInfo | URL) => {
    const u = urlOf(info);
    for (const [prefix, fn] of Object.entries(patternMap)) {
      if (u.startsWith(prefix) || (prefix && u.includes(prefix) && !u.startsWith('https://r.jina.ai'))) {
        return fn();
      }
    }
    return Promise.resolve(ok(''));
  });
  return mockFetch;
}

beforeEach(async () => {
  vi.clearAllMocks();
  useSettingsStore.setState({ provider: 'default' });
  const db = await getDb();
  const tx = db.transaction([STORES.SOURCE_CACHE], 'readwrite');
  await tx.objectStore(STORES.SOURCE_CACHE).clear();
  await tx.done;
});

describe('isLikelyUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://foo.bar/baz', true],
    ['example.com/page', true],
    ['sub.domain.org', true],
    ['plain text with spaces', false],
    ['gravity', false],
    ['', false],
  ])('returns %s for "%s"', (input, expected) => {
    expect(isLikelyUrl(input)).toBe(expected);
  });
});

describe('fetchSourceContent', () => {
  describe('cache hit', () => {
    it('returns cached content without network calls', async () => {
      await setCachedSource('https://example.com', 'cached text');
      const result = await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      expect(result).toEqual({ content: 'cached text', source: 'cache', url: 'https://example.com' });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('URL subject — Jina path', () => {
    it('fetches via Jina when it succeeds', async () => {
      mockWith({ 'https://r.jina.ai': () => Promise.resolve(ok(LONG)) });
      const result = await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      expect(result.source).toBe('jina');
      expect(result.content).toBe(LONG);
    });

    it('sends Jina token in Authorization header', async () => {
      mockWith({ 'https://r.jina.ai': () => Promise.resolve(ok(LONG)) });
      await fetchSourceContent('https://example.com', { apiKey: '', jinaToken: 'jkey', persona: 'student' });
      const call = mockFetch.mock.calls.find(([u]) => urlOf(u as RequestInfo).startsWith('https://r.jina.ai'));
      const opts = call![1] as Record<string, unknown>;
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer jkey');
    });
  });

  describe('URL subject — proxy fallback', () => {
    it('falls through to proxies when Jina returns empty', async () => {
      mockWith({
        'https://r.jina.ai': () => Promise.resolve(ok('')),
        'allorigins': () => Promise.resolve(ok(LONG)),
      });
      const result = await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      expect(result.content).toBe(LONG);
      expect(result.source).not.toBe('llm');
    });

    it('falls through to proxies when Jina throws', async () => {
      mockWith({
        'https://r.jina.ai': () => Promise.reject(new Error('Jina died')),
        'allorigins': () => Promise.resolve(ok(LONG)),
      });
      const result = await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      expect(result.content).toBe(LONG);
    });

    it('tries cfproxy when all public proxies fail', async () => {
      mockWith({
        'https://r.jina.ai': () => Promise.resolve(ok('')),
        '/api/fetch': () => Promise.resolve(ok(LONG)),
      });
      const result = await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      expect(result.content).toBe(LONG);
      expect(result.source).toBe('cfproxy');
    });
  });

  describe('URL subject — LLM fallback', () => {
    it('calls LLM when Jina, proxies, and cfproxy all fail', async () => {
      mockWith({
        'https://opencode.ai': () => Promise.resolve(llmResp(LONG)),
      });
      const result = await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      expect(result.source).toBe('llm');
      expect(result.content).toBe(LONG);
    });

    it('LLM call includes OpenCode headers', async () => {
      mockWith({
        'https://opencode.ai': () => Promise.resolve(llmResp(LONG)),
      });
      await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      const llmCalls = mockFetch.mock.calls.filter(([u]) => urlOf(u as RequestInfo).includes('opencode.ai'));
      expect(llmCalls.length).toBeGreaterThan(0);
      const headers = (llmCalls[0][1] as Record<string, unknown>).headers as Record<string, string>;
      expect(headers['x-opencode-client']).toBe('cli');
      expect(headers['User-Agent']).toContain('opencode');
    });

    it('includes Authorization: Bearer public for default provider', async () => {
      mockWith({
        'https://opencode.ai': () => Promise.resolve(llmResp(LONG)),
      });
      await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      const llmCalls = mockFetch.mock.calls.filter(([u]) => urlOf(u as RequestInfo).includes('opencode.ai'));
      const headers = (llmCalls[0][1] as Record<string, unknown>).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer public');
    });

    it('uses selected provider for the LLM call', async () => {
      useSettingsStore.setState({ provider: 'mistral' });
      mockWith({
        'https://api.mistral.ai': () => Promise.resolve(llmResp(LONG)),
      });
      const result = await fetchSourceContent('https://example.com', { apiKey: 'mist-key', persona: 'student' });
      expect(result.source).toBe('llm');
      expect(result.content).toBe(LONG);
    });
  });

  describe('text subject (non-URL)', () => {
    it('calls LLM directly with educational prompt', async () => {
      mockWith({
        'https://opencode.ai': () => Promise.resolve(llmResp(LONG)),
      });
      const result = await fetchSourceContent('gravity', { apiKey: '', persona: 'student' });
      expect(result.source).toBe('llm');
      expect(result.content).toBe(LONG);
    });

    it('throws descriptive error when LLM fails', async () => {
      mockWith({
        'https://opencode.ai': () => Promise.resolve(errStatus(500)),
      });
      await expect(
        fetchSourceContent('gravity', { apiKey: '', persona: 'student' })
      ).rejects.toThrow(/Couldn't generate content for "gravity"/);
    });
  });

  describe('content validation', () => {
    it('throws when fetched content is too short', async () => {
      mockWith({ 'https://r.jina.ai': () => Promise.resolve(ok(SHORT)) });
      await expect(
        fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' })
      ).rejects.toThrow(/Failed to fetch content/);
    });
  });

  describe('caching', () => {
    it('caches content after successful fetch', async () => {
      mockWith({ 'https://r.jina.ai': () => Promise.resolve(ok(LONG)) });
      await fetchSourceContent('https://example.com', { apiKey: '', persona: 'student' });
      const cached = await getCachedSource('https://example.com');
      expect(cached).toBe(LONG);
    });
  });
});
