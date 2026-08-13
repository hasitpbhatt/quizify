import { validateChatBody } from '../_shared/validateRequest';

export async function onRequest(context: EventContext): Promise<Response> {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const mistralApiKey = env.MISTRAL_API_KEY;
  const body: unknown = await request.json();
  const validation = validateChatBody(body);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ error: `Invalid request payload: ${validation.error}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!mistralApiKey) {
    return new Response(
      JSON.stringify({ error: 'Default provider unavailable — no server-side Mistral key configured (set MISTRAL_API_KEY).' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await mistralResponse.text();
    return new Response(text, {
      status: mistralResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn('Mistral fetch failed', err);
    return new Response(
      JSON.stringify({ error: 'Upstream Mistral request failed.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
