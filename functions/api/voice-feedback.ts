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
    const body = (await request.json()) as {
      conceptTitle: string;
      question: string;
      answer: string;
      grade: 'correct' | 'partial' | 'incorrect';
      rationale?: string;
      persona?: string;
    };

    const prompt = `You are a supportive, high-clarity voice tutor. 
Concept: "${body.conceptTitle}"
Question asked: "${body.question}"
Student answer: "${body.answer}"
Grade result: ${body.grade.toUpperCase()}
Explanation details: "${body.rationale || ''}"

Generate a short 1-2 sentence SPOKEN response directly addressing the student.
Rules:
- Speak directly in second person ("You got it right because...", "Close! The key part is...")
- NO markdown formatting, NO bullet points, NO quotes around words. Pure plain text meant for speech synthesis.
- If correct: warm reinforcement of the key insight.
- If partial or incorrect: non-shaming, constructive redirection pointing to the underlying principle.`;

    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
      }),
    });

    if (!mistralResponse.ok) {
      const errText = await mistralResponse.text();
      return new Response(
        JSON.stringify({ error: 'Feedback generation failed', detail: errText }),
        { status: mistralResponse.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const json = (await mistralResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const feedback = json.choices?.[0]?.message?.content?.trim() || 'Good effort! Let’s keep reviewing.';

    return new Response(JSON.stringify({ feedback }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn('Voice feedback proxy failed', err);
    return new Response(
      JSON.stringify({ error: 'Voice feedback request failed.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
