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
    const { audio, format } = (await request.json()) as {
      audio: string;
      format?: string;
    };

    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'audio base64 is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const binary = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    const mimeType = format === 'wav' ? 'audio/wav' : format === 'mp4' ? 'audio/mp4' : 'audio/webm';

    const formData = new FormData();
    formData.append('file', new Blob([binary], { type: mimeType }), `recording.${format || 'webm'}`);
    formData.append('model', 'voxtral-mini-2602');

    const mistralResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: formData,
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return new Response(
        JSON.stringify({ error: 'STT upstream failed', detail: errText }),
        { status: mistralResponse.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const result = (await mistralResponse.json()) as { text: string };
    return new Response(JSON.stringify({ text: result.text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn('STT proxy failed', err);
    return new Response(
      JSON.stringify({ error: 'STT request failed.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
