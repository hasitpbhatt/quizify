import { debugLog } from '@/lib/debug';

const TTS_FETCH_TIMEOUT_MS = 15000;

export async function fetchTtsBlob(text: string, voiceId?: string): Promise<Blob | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);

    debugLog('log', 'tts', 'TTS request text_len=%d', text.length);

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      debugLog('warn', 'tts', 'TTS failed status=%d → browser fallback', res.status);
      return null;
    }

    return await res.blob();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('TTS request timed out, falling back to browser TTS');
    } else {
      console.error('TTS network error:', err);
    }
    return null;
  }
}
