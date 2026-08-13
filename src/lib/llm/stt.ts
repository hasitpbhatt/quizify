import { debugLog } from '@/lib/debug';

const STT_FETCH_TIMEOUT_MS = 20000;

export async function transcribeAudio(
  audioBlob: Blob,
  format: 'webm' | 'wav' | 'mp4' = 'webm',
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STT_FETCH_TIMEOUT_MS);

    // Convert Blob to Base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    debugLog('log', 'stt', 'STT request audio_bytes=%d format=%s', bytes.byteLength, format);

    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64Audio, format }),
      signal: signal ?? controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      debugLog('warn', 'stt', 'STT API failed status=%d', res.status);
      return null;
    }

    const data = (await res.json()) as { text?: string };
    return data.text ?? null;
  } catch (err) {
    console.error('STT request failed:', err);
    return null;
  }
}
