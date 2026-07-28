/// <reference types="@cloudflare/workers-types" />

interface Env {
  MISTRAL_API_KEY?: string;
}

export async function onRequest(context: EventContext<Env, string, unknown>): Promise<Response> {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const mistralApiKey = env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    return new Response(
      JSON.stringify({ error: 'MISTRAL_API_KEY not configured.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { text, voiceId, responseFormat } = await request.json() as {
      text: string;
      voiceId?: string;
      responseFormat?: string;
    };

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const mistralResponse = await fetch('https://api.mistral.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'voxtral-mini-tts-2603',
        input: text,
        voice_id: voiceId ?? 'gb_jane_neutral',
        response_format: responseFormat ?? 'mp3',
        stream: false,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return new Response(
        JSON.stringify({ error: 'TTS upstream failed', detail: errText }),
        { status: mistralResponse.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { audio_data } = await mistralResponse.json() as { audio_data: string };
    const binary = Uint8Array.from(atob(audio_data), (c) => c.charCodeAt(0));
    const contentType = responseFormat === 'wav' ? 'audio/wav'
      : responseFormat === 'flac' ? 'audio/flac'
      : responseFormat === 'opus' ? 'audio/opus'
      : 'audio/mpeg';

    return new Response(binary, {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.warn('TTS proxy failed', err);
    return new Response(
      JSON.stringify({ error: 'TTS request failed.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
