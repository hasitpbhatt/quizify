import { useSettingsStore } from '@/shared/stores/settingsStore';

const TTS_FETCH_TIMEOUT_MS = 10000;

export async function fetchTtsBlob(text: string): Promise<Blob | null> {
  const { apiKey, provider } = useSettingsStore.getState();
  
  if (!apiKey || provider !== 'mistral') {
    return null; // Will fallback to browser TTS
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TTS_FETCH_TIMEOUT_MS);

    const res = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'voxtral-mini-tts-2603',
        input: text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn('Mistral TTS failed, falling back to browser TTS', await res.text());
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