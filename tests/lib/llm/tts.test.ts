import { fetchTtsBlob } from '@/lib/llm/tts';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchTtsBlob', () => {
  it('sends request to /api/tts with correct params', async () => {
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio data'])) });

    await fetchTtsBlob('Say this');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/tts');
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.text).toBe('Say this');
  });

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

  it('returns null on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const result = await fetchTtsBlob('Test');
    expect(result).toBeNull();
  });
});
