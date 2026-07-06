export async function onRequest(context: EventContext): Promise<Response> {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const mistralApiKey = env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: MISTRAL_API_KEY not set' }), { status: 500 });
  }

  const body: Record<string, unknown> = await request.json();

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
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
