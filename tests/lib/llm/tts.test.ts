import { fetchTtsBlob } from '@/lib/llm/tts';
import { useSettingsStore } from '@/shared/stores/settingsStore';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ apiKey: '', provider: 'mistral' });
});

describe('fetchTtsBlob', () => {
  it('returns null when no API key is set', async () => {
    useSettingsStore.setState({ apiKey: '' });
    const result = await fetchTtsBlob('Hello');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when provider is not mistral', async () => {
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'default' });
    const result = await fetchTtsBlob('Hello');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when provider is nvidia', async () => {
    useSettingsStore.setState({ apiKey: 'nv-test', provider: 'nvidia' });
    const result = await fetchTtsBlob('Hello');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends request to Mistral TTS endpoint with correct params', async () => {
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'mistral' });
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['audio data'])) });

    await fetchTtsBlob('Say this');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/audio/speech');
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('voxtral-mini-tts-2603');
    expect(body.voice).toBe('en_paul_cheerful');
    expect(body.input).toBe('Say this');
  });

  it('returns Blob on successful response', async () => {
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'mistral' });
    const blob = new Blob(['audio data']);
    mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });

    const result = await fetchTtsBlob('Test');
    expect(result).toBe(blob);
  });

  it('returns null and warns on non-ok response', async () => {
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'mistral' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('Bad Request') });

    const result = await fetchTtsBlob('Test');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null and logs error on network failure', async () => {
    useSettingsStore.setState({ apiKey: 'sk-test', provider: 'mistral' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const result = await fetchTtsBlob('Test');
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
