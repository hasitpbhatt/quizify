import { chat } from '@/lib/llm/chat';
import { AuthError, RateLimitError, NetworkError } from '@/lib/llm/errors';
import { useSettingsStore } from '@/shared/stores/settingsStore';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  useSettingsStore.setState({ provider: 'default' });
});

afterEach(() => {
  vi.useRealTimers();
});

function okResponse(overrides: Partial<{ content: string; model: string; usage: object }> = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: overrides.content ?? 'Hello!' } }],
      model: overrides.model ?? 'deepseek-v4-flash-free',
      ...(overrides.usage ? { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } } : {}),
    }),
  };
}

function statusResponse(status: number) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve({}) };
}

/** Mock fetch that optionally honors abort signals (used in abort test). */
function abortAwareMock(response: unknown) {
  mockFetch.mockImplementation((_url: string, opts?: RequestInit) => {
    return new Promise((resolve, reject) => {
      const signal = (opts as { signal?: AbortSignal })?.signal;
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', onAbort, { once: true });
      queueMicrotask(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve(response as Response);
      });
    });
  });
}

describe('chat', () => {
  const messages = [{ role: 'user' as const, content: 'Hi' }];

  describe('successful requests', () => {
    it('returns content from a successful request', async () => {
      mockFetch.mockResolvedValue(okResponse({ content: 'Response text' }));
      const result = await chat(messages, { apiKey: '', provider: 'default' });
      expect(result.content).toBe('Response text');
    });

    it('returns model name', async () => {
      mockFetch.mockResolvedValue(okResponse({ model: 'test-model' }));
      const result = await chat(messages, { apiKey: '', provider: 'default' });
      expect(result.model).toBe('test-model');
    });

    it('returns usage stats when present', async () => {
      mockFetch.mockResolvedValue(okResponse({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }));
      const result = await chat(messages, { apiKey: '', provider: 'default' });
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    });

    it('returns undefined usage when not in response', async () => {
      mockFetch.mockResolvedValue(okResponse());
      const result = await chat(messages, { apiKey: '', provider: 'default' });
      expect(result.usage).toBeUndefined();
    });

    it('defaults empty content when choices are missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ choices: [] }),
      });
      const result = await chat(messages, { apiKey: '', provider: 'default' });
      expect(result.content).toBe('');
    });
  });

  describe('request formatting', () => {
    it('sends POST with correct Content-Type', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(opts.method).toBe('POST');
      expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
    });

    it('sends messages and model in the body', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.messages).toEqual(messages);
      expect(body.model).toBe('deepseek-v4-flash-free');
      expect(body.stream).toBe(false);
    });

    it('includes response_format json when requested', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', responseFormat: 'json', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('uses custom model when provided', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', model: 'custom-model', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.model).toBe('custom-model');
    });

    it('uses custom temperature when provided', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', temperature: 0.7, provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.temperature).toBe(0.7);
    });
  });

  describe('auth headers', () => {
    it('sends Bearer token from defaultBearerToken when available', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer public');
    });

    it('sends Bearer token from apiKey when no defaultBearerToken', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: 'sk-test', provider: 'mistral' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    });

    it('sends OpenCode-specific headers when defaultBearerToken is set', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['User-Agent']).toContain('opencode/');
      expect(headers['x-opencode-client']).toBe('cli');
      expect(headers['x-opencode-project']).toBe('global');
    });

    it('does not send OpenCode headers for non-default providers', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: 'sk-test', provider: 'mistral' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers['x-opencode-client']).toBeUndefined();
    });

    it('includes Authorization Bearer public even when apiKey is empty for default provider', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { apiKey: '', provider: 'default' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer public');
    });
  });

  describe('error handling and retries', () => {
    it('throws AuthError on 401', async () => {
      mockFetch.mockResolvedValue(statusResponse(401));
      await expect(chat(messages, { apiKey: 'bad', provider: 'default' })).rejects.toThrow(AuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws AuthError on 403', async () => {
      mockFetch.mockResolvedValue(statusResponse(403));
      await expect(chat(messages, { apiKey: 'bad', provider: 'default' })).rejects.toThrow(AuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 and throws RateLimitError after exhaustion', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(statusResponse(429));
      const promise = chat(messages, { apiKey: '', model: 'custom-test', provider: 'default' });
      await vi.advanceTimersByTimeAsync(40_000);
      await expect(promise).rejects.toThrow(RateLimitError);
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
      vi.useRealTimers();
    });

    it('retries on 5xx and throws NetworkError after exhaustion', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(statusResponse(502));
      const promise = chat(messages, { apiKey: '', model: 'custom-test', provider: 'default' });
      await vi.advanceTimersByTimeAsync(40_000);
      await expect(promise).rejects.toThrow(NetworkError);
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
      vi.useRealTimers();
    });

    it('throws NetworkError on non-retryable error status', async () => {
      mockFetch.mockResolvedValue(statusResponse(400));
      await expect(chat(messages, { apiKey: '', provider: 'default' })).rejects.toThrow(NetworkError);
    });

    it('aborts on user signal', async () => {
      const ac = new AbortController();
      ac.abort();
      abortAwareMock(okResponse());
      await expect(chat(messages, { apiKey: '', signal: ac.signal })).rejects.toThrow(/abort/i);
    });

    it('handles network failure with retry then fallback', async () => {
      vi.useFakeTimers();
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const promise = chat(messages, { apiKey: '', model: 'custom-test', provider: 'default' });
      await vi.advanceTimersByTimeAsync(80_000);
      await expect(promise).rejects.toThrow('All endpoints exhausted');
      vi.useRealTimers();
    });
  });

  describe('fallback endpoint', () => {
    it('tries primary endpoint then fallback for default provider', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(okResponse({ content: 'Fallback response' }));
      const promise = chat(messages, { apiKey: '', provider: 'default' });
      await vi.advanceTimersByTimeAsync(120_000);
      const result = await promise;
      expect(result.content).toBe('Fallback response');
      vi.useRealTimers();
    });

    it('does not include fallback endpoint for mistral', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(statusResponse(429));
      const promise = chat(messages, { apiKey: 'sk-test', model: 'custom-test', provider: 'mistral' });
      await vi.advanceTimersByTimeAsync(40_000);
      await expect(promise).rejects.toThrow(RateLimitError);
      vi.useRealTimers();
    });
  });

  describe('fallback models', () => {
    it('tries fallback model after default model fails', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(okResponse({ content: 'Fallback model response' }));
      const promise = chat(messages, { apiKey: '', provider: 'default' });
      await vi.advanceTimersByTimeAsync(120_000);
      const result = await promise;
      expect(result.content).toBe('Fallback model response');
      vi.useRealTimers();
    });
  });

  describe('response with missing optional fields', () => {
    it('handles JSON without choices array gracefully', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
      const result = await chat(messages, { apiKey: '', provider: 'default' });
      expect(result.content).toBe('');
    });
  });
});
