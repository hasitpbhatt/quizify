import { chat } from '@/lib/llm/chat';
import { AuthError, RateLimitError, NetworkError } from '@/lib/llm/errors';

vi.mock('@/lib/llm/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function okResponse(overrides: Partial<{ content: string; model: string; usage: object }> = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content: overrides.content ?? 'Hello!' } }],
      model: overrides.model ?? 'mistral-large-latest',
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
      const result = await chat(messages, {});
      expect(result.content).toBe('Response text');
    });

    it('returns model name', async () => {
      mockFetch.mockResolvedValue(okResponse({ model: 'test-model' }));
      const result = await chat(messages, {});
      expect(result.model).toBe('test-model');
    });

    it('returns usage stats when present', async () => {
      mockFetch.mockResolvedValue(okResponse({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }));
      const result = await chat(messages, {});
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    });

    it('returns undefined usage when not in response', async () => {
      mockFetch.mockResolvedValue(okResponse());
      const result = await chat(messages, {});
      expect(result.usage).toBeUndefined();
    });

    it('defaults empty content when choices are missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true, status: 200,
        json: () => Promise.resolve({ choices: [] }),
      });
      const result = await chat(messages, {});
      expect(result.content).toBe('');
    });
  });

  describe('request formatting', () => {
    it('sends POST with correct Content-Type', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, {});
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(opts.method).toBe('POST');
      expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
    });

    it('sends messages and model in the body', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, {});
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.messages).toEqual(messages);
      expect(body.model).toBe('mistral-large-latest');
      expect(body.stream).toBe(false);
    });

    it('includes response_format json when requested', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { responseFormat: 'json' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('uses custom model when provided', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { model: 'custom-model' });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.model).toBe('custom-model');
    });

    it('uses custom temperature when provided', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, { temperature: 0.7 });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.temperature).toBe(0.7);
    });

    it('does not send Authorization header', async () => {
      mockFetch.mockResolvedValue(okResponse());
      await chat(messages, {});
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('error handling and retries', () => {
    it('throws AuthError on 401', async () => {
      mockFetch.mockResolvedValue(statusResponse(401));
      await expect(chat(messages, {})).rejects.toThrow(AuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws AuthError on 403', async () => {
      mockFetch.mockResolvedValue(statusResponse(403));
      await expect(chat(messages, {})).rejects.toThrow(AuthError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 and throws RateLimitError after exhaustion', async () => {
      mockFetch.mockResolvedValue(statusResponse(429));
      await expect(chat(messages, { model: 'custom-test' })).rejects.toThrow(RateLimitError);
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('retries on 5xx and throws NetworkError after exhaustion', async () => {
      mockFetch.mockResolvedValue(statusResponse(502));
      await expect(chat(messages, { model: 'custom-test' })).rejects.toThrow(NetworkError);
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('throws NetworkError on non-retryable error status', async () => {
      mockFetch.mockResolvedValue(statusResponse(400));
      await expect(chat(messages, {})).rejects.toThrow(NetworkError);
    });

    it('aborts on user signal', async () => {
      const ac = new AbortController();
      ac.abort();
      abortAwareMock(okResponse());
      await expect(chat(messages, { signal: ac.signal })).rejects.toThrow(/abort/i);
    });

    it('handles network failure with retry then fallback', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(chat(messages, { model: 'custom-test' })).rejects.toThrow('All endpoints exhausted');
    });
  });

  describe('streaming (onToken)', () => {
    function sseResponse(chunks: string[]) {
      const encoder = new TextEncoder();
      let i = 0;
      return {
        ok: true, status: 200,
        body: {
          getReader: () => ({
            read: () => {
              if (i >= chunks.length) return Promise.resolve({ done: true, value: undefined });
              return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
            },
            cancel: () => {},
            releaseLock: () => {},
          }),
        },
      } as unknown as Response;
    }

    it('sets body.stream to true when onToken is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true, status: 200,
        body: undefined,
        text: () => Promise.resolve('{"choices":[{"message":{"content":""}}]}'),
      } as unknown as Response);
      const onToken = vi.fn();
      await chat(messages, { onToken });
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(opts.body as string);
      expect(body.stream).toBe(true);
    });

    it('calls onToken with each SSE delta and returns full accumulated content', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":"world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      mockFetch.mockResolvedValue(sseResponse(chunks));
      const onToken = vi.fn();
      const result = await chat(messages, { onToken });
      expect(onToken).toHaveBeenCalledTimes(2);
      expect(onToken).toHaveBeenNthCalledWith(1, 'Hello ');
      expect(onToken).toHaveBeenNthCalledWith(2, 'world');
      expect(result.content).toBe('Hello world');
    });

    it('falls back to res.text() when body has no reader and calls onToken once', async () => {
      mockFetch.mockResolvedValue({
        ok: true, status: 200,
        body: undefined,
        text: () => Promise.resolve('{"choices":[{"message":{"content":"full text"}}]}'),
      } as unknown as Response);
      const onToken = vi.fn();
      const result = await chat(messages, { onToken });
      expect(onToken).toHaveBeenCalledOnce();
      expect(onToken).toHaveBeenCalledWith('{"choices":[{"message":{"content":"full text"}}]}');
      expect(result.content).toBe('{"choices":[{"message":{"content":"full text"}}]}');
    });
  });

  describe('fallback model', () => {
    it('tries fallback model after default model fails', async () => {
      mockFetch
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(statusResponse(429))
        .mockResolvedValue(okResponse({ content: 'Fallback model response' }));
      const result = await chat(messages, {});
      expect(result.content).toBe('Fallback model response');
    });
  });

  describe('response with missing optional fields', () => {
    it('handles JSON without choices array gracefully', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
      const result = await chat(messages, {});
      expect(result.content).toBe('');
    });
  });
});
