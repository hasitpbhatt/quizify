const OPENCODE_BASE = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_MODEL = 'deepseek-v4-flash-free';
const OPENCODE_TOKEN = 'public';
const OPENCODE_HEADERS: Record<string, string> = {
  'User-Agent': 'opencode/1.17.13 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
  'x-opencode-client': 'cli',
  'x-opencode-project': 'global',
};

async function tryOpenCode(body: Record<string, unknown>): Promise<Response | null> {
  try {
    const res = await fetch(OPENCODE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCODE_TOKEN}`,
        ...OPENCODE_HEADERS,
      },
      body: JSON.stringify({ ...body, model: OPENCODE_MODEL }),
    });
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    console.warn('OpenCode returned', res.status, text.slice(0, 200));
    return null;
  } catch (err) {
    console.warn('OpenCode fetch failed', err);
    return null;
  }
}

export async function onRequest(context: EventContext): Promise<Response> {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const mistralApiKey = env.MISTRAL_API_KEY;
  const body: Record<string, unknown> = await request.json();

  // Phase 1: Try Mistral
  if (mistralApiKey) {
    try {
      const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mistralApiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (mistralResponse.ok) {
        const text = await mistralResponse.text();
        return new Response(text, {
          status: mistralResponse.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // fall through to OpenCode
    }
  }

  // Phase 2: Fallback to OpenCode
  const opencodeResponse = await tryOpenCode(body);
  if (opencodeResponse) {
    const text = await opencodeResponse.text();
    return new Response(text, {
      status: opencodeResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ error: 'Both Mistral and OpenCode failed' }),
    { status: 502, headers: { 'Content-Type': 'application/json' } },
  );
}
