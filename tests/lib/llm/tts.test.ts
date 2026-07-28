import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTtsBlob } from '@/lib/llm/tts';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchTtsBlob', () => {
  describe('request construction', () => {
    it('sends POST to /api/tts with text in body', async () => {
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });

      await fetchTtsBlob('Say this');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/tts');
      expect(opts.method).toBe('POST');
      expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(opts.body)).toEqual({ text: 'Say this' });
    });

    it('passes voiceId in request body when provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });

      await fetchTtsBlob('Hello', 'gb_jane_neutral');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe('Hello');
      expect(body.voiceId).toBe('gb_jane_neutral');
    });

    it('omits voiceId from body when not provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });

      await fetchTtsBlob('Hello');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).not.toHaveProperty('voiceId');
    });

    it('includes an AbortSignal in the fetch options', async () => {
      let capturedSignal: AbortSignal | null | undefined;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedSignal = opts.signal;
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });
      });

      await fetchTtsBlob('Test');

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal?.aborted).toBe(false);
    });

    it('sends request for empty string text', async () => {
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });

      await fetchTtsBlob('');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe('');
    });

    it('sends request for very long text', async () => {
      const longText = 'A'.repeat(10000);
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });

      await fetchTtsBlob(longText);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe(longText);
    });
  });

  describe('response handling', () => {
    it('returns Blob on successful response', async () => {
      const blob = new Blob(['audio data']);
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });

      const result = await fetchTtsBlob('Test');

      expect(result).toBe(blob);
    });

    it('returns null on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('Bad Request') });

      const result = await fetchTtsBlob('Test');

      expect(result).toBeNull();
    });

    it('returns null on 502 from upstream', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve('Upstream error') });

      const result = await fetchTtsBlob('Test');

      expect(result).toBeNull();
    });

    it('returns null on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await fetchTtsBlob('Test');

      expect(result).toBeNull();
    });

    it('returns null on abort', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      const result = await fetchTtsBlob('Test');

      expect(result).toBeNull();
    });

    it('returns null on TypeError (CORS or network protocol)', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await fetchTtsBlob('Test');

      expect(result).toBeNull();
    });
  });

  describe('timeout behavior', () => {
    it('rejects the request when the 15-second timeout fires', async () => {
      vi.useFakeTimers();
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        const signal = opts.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const promise = fetchTtsBlob('Test');
      vi.advanceTimersByTime(15000);

      await promise;

      expect(abortSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('clears the timeout when request completes before timeout', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });

      await fetchTtsBlob('Fast response');

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('concurrent requests', () => {
    it('handles multiple simultaneous requests independently', async () => {
      const resolver: Array<() => void> = [];
      mockFetch.mockImplementation(
        () => new Promise<Response>((resolve) => {
          resolver.push(() => resolve({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) } as Response));
        }),
      );

      const promise1 = fetchTtsBlob('First');
      const promise2 = fetchTtsBlob('Second');

      expect(mockFetch).toHaveBeenCalledTimes(2);

      resolver[0]();
      resolver[1]();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBeInstanceOf(Blob);
      expect(result2).toBeInstanceOf(Blob);
    });

    it('each request uses a separate AbortController', async () => {
      const signals: AbortSignal[] = [];
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        signals.push(opts.signal as AbortSignal);
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) });
      });

      await Promise.all([fetchTtsBlob('A'), fetchTtsBlob('B')]);

      expect(signals).toHaveLength(2);
      expect(signals[0]).not.toBe(signals[1]);
    });
  });
});
