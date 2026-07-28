import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from '../../../functions/api/tts';

/**
 * Minimal EventContext shape used by Cloudflare Pages functions.
 */
interface MockEventContext {
  request: Request;
  env: Record<string, string | undefined>;
}

const MOCK_API_KEY = 'test-mistral-key-12345';

function createContext(
  overrides: Partial<MockEventContext> & { body?: string; method?: string } = {},
): MockEventContext {
  const method = overrides.method ?? 'POST';
  const body = overrides.body ?? JSON.stringify({ text: 'Hello world' });
  return {
    request: new Request(`http://localhost/api/tts`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : body,
    }),
    env: { MISTRAL_API_KEY: MOCK_API_KEY },
    ...overrides,
  };
}

const mockUpstreamFetch = vi.fn();
vi.stubGlobal('fetch', mockUpstreamFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HTTP method validation', () => {
  it('returns 405 for GET requests', async () => {
    const ctx = createContext({ method: 'GET' });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(405);
    expect(await res.text()).toBe('Method not allowed');
  });

  it('returns 405 for DELETE requests', async () => {
    const ctx = createContext({ method: 'DELETE' });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(405);
  });

  it('returns 405 for PUT requests', async () => {
    const ctx = createContext({ method: 'PUT' });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(405);
  });

  it('accepts POST requests', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: 'dGVzdCBhdWRpbw==' }),
    });
    const ctx = createContext();
    const res = await onRequest(ctx as any);
    expect(res.status).not.toBe(405);
  });
});

describe('API key validation', () => {
  it('returns 502 when MISTRAL_API_KEY is missing', async () => {
    const ctx = createContext({ env: {} });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('MISTRAL_API_KEY');
  });

  it('returns 502 when MISTRAL_API_KEY is empty string', async () => {
    const ctx = createContext({ env: { MISTRAL_API_KEY: '' } });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(502);
  });
});

describe('request body validation', () => {
  it('returns 400 when text is missing', async () => {
    const ctx = createContext({ body: JSON.stringify({}) });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('text is required');
  });

  it('returns 400 when text is empty string', async () => {
    const ctx = createContext({ body: JSON.stringify({ text: '' }) });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const ctx = createContext({ body: 'not-json' });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(502);
  });
});

describe('Mistral API interaction', () => {
  it('forwards text to Mistral TTS endpoint with correct parameters', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: 'dGVzdCBhdWRpbw==' }),
    });

    const ctx = createContext({ body: JSON.stringify({ text: 'Say this aloud' }) });
    await onRequest(ctx as any);

    expect(mockUpstreamFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockUpstreamFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/audio/speech');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-mistral-key-12345');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('voxtral-mini-tts-2603');
    expect(body.input).toBe('Say this aloud');
    expect(body.voice_id).toBe('gb_jane_neutral');
    expect(body.response_format).toBe('mp3');
    expect(body.stream).toBe(false);
  });

  it('uses custom voiceId when provided', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: 'dGVzdCBhdWRpbw==' }),
    });

    const ctx = createContext({
      body: JSON.stringify({ text: 'Hello', voiceId: 'gb_emma_neutral' }),
    });
    await onRequest(ctx as any);

    const body = JSON.parse(mockUpstreamFetch.mock.calls[0][1].body);
    expect(body.voice_id).toBe('gb_emma_neutral');
  });

  it('uses custom response_format when provided', async () => {
    mockUpstreamFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audio_data: 'dGVzdCBhdWRpbw==' }),
    });

    const ctx = createContext({
      body: JSON.stringify({ text: 'Hello', responseFormat: 'wav' }),
    });
    await onRequest(ctx as any);

    const body = JSON.parse(mockUpstreamFetch.mock.calls[0][1].body);
    expect(body.response_format).toBe('wav');
  });

  it('returns 502 when Mistral API fails with non-ok status', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Invalid voice'),
    });

    const ctx = createContext();
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('TTS upstream failed');
    expect(body.detail).toBe('Invalid voice');
  });

  it('returns 502 when Mistral API returns server error', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal error'),
    });

    const ctx = createContext();
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(500);
  });

  it('returns 502 on network failure to Mistral', async () => {
    mockUpstreamFetch.mockRejectedValue(new Error('Connection refused'));

    const ctx = createContext();
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('TTS request failed.');
  });
});

describe('response handling', () => {
  it('returns decoded binary audio with correct Content-Type (mp3)', async () => {
    const audioBase64 = btoa('fake-mp3-binary-data');
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: audioBase64 }),
    });

    const ctx = createContext();
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe('fake-mp3-binary-data');
  });

  it('returns audio/wav when response_format is wav', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: btoa('wav-data') }),
    });

    const ctx = createContext({
      body: JSON.stringify({ text: 'Hello', responseFormat: 'wav' }),
    });
    const res = await onRequest(ctx as any);
    expect(res.headers.get('Content-Type')).toBe('audio/wav');
  });

  it('returns audio/flac when response_format is flac', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: btoa('flac-data') }),
    });

    const ctx = createContext({
      body: JSON.stringify({ text: 'Hello', responseFormat: 'flac' }),
    });
    const res = await onRequest(ctx as any);
    expect(res.headers.get('Content-Type')).toBe('audio/flac');
  });

  it('returns audio/opus when response_format is opus', async () => {
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: btoa('opus-data') }),
    });

    const ctx = createContext({
      body: JSON.stringify({ text: 'Hello', responseFormat: 'opus' }),
    });
    const res = await onRequest(ctx as any);
    expect(res.headers.get('Content-Type')).toBe('audio/opus');
  });

  it('decodes base64 audio_data correctly', async () => {
    const original = 'Hello Audio World!';
    const audioBase64 = btoa(original);
    mockUpstreamFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audio_data: audioBase64 }),
    });

    const ctx = createContext();
    const res = await onRequest(ctx as any);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe(original);
  });
});
