import { handleAgentsRequest } from '../_agents-core';

export async function onRequest(context: { request: Request; env: Record<string, string | undefined> }): Promise<Response> {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const mistralApiKey = env.MISTRAL_API_KEY as string | undefined;
  const body = await request.json();

  return handleAgentsRequest(body as Parameters<typeof handleAgentsRequest>[0], mistralApiKey ?? '');
}