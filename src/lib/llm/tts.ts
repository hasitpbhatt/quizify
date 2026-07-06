import { useSettingsStore } from '@/shared/stores/settingsStore';

export async function fetchTtsBlob(text: string): Promise<Blob | null> {
  const { apiKey, provider } = useSettingsStore.getState();
  
  if (!apiKey || provider !== 'mistral') {
    return null; // Will fallback to browser TTS
  }

  try {
    const res = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'voxtral-mini-tts-2603',
        voice: 'en_paul_cheerful',
        input: text,
      }),
    });

    if (!res.ok) {
      console.warn('Mistral TTS failed, falling back to browser TTS', await res.text());
      return null;
    }

    return await res.blob();
  } catch (err) {
    console.error('Mistral TTS network error:', err);
    return null;
  }
}
