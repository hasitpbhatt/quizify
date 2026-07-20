import { debugLog } from '@/lib/debug';

const TTS_FETCH_TIMEOUT_MS = 10000;

export async function fetchTtsBlob(text: string): Promise<Blob | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);

    debugLog('log', 'tts', 'Mistral TTS request text_len=%d', text.length);

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      debugLog('warn', 'tts', 'Mistral TTS failed status=%d → browser fallback', res.status);
      return null;
    }

    return await res.blob();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('Mistral TTS request timed out, falling back to browser TTS');
    } else {
      console.error('Mistral TTS network error:', err);
    }
    return null;
  }
}
