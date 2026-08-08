import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAgentsRequest } from '../../../functions/_agents-core';
import { onRequest } from '../../../functions/api/agents';

const MOCK_API_KEY = 'test-mistral-key-12345';

interface MockEventContext {
  request: Request;
  env: Record<string, string | undefined>;
}

function createContext(
  overrides: Partial<MockEventContext> & { body?: string; method?: string } = {},
): MockEventContext {
  const method = overrides.method ?? 'POST';
  const body = overrides.body ?? JSON.stringify({ inputs: [{ role: 'user', content: 'Hi' }] });
  return {
    request: new Request('http://localhost/api/agents', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : body,
    }),
    env: { MISTRAL_API_KEY: MOCK_API_KEY },
    ...overrides,
  };
}

const mockUpstreamFetch = vi.fn();
vi.stubGlobal('fetch', mockUpstreamFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function upstreamResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const fullConversationResponse = {
  object: 'conversation.response',
  conversation_id: 'conv_123',
  outputs: [
    {
      type: 'message.output',
      content: [
        { type: 'text', text: 'Search results overview.' },
        {
          type: 'tool_reference',
          tool: 'web_search',
          title: 'Example Source',
          url: 'https://example.com',
          description: 'A snippet.',
        },
      ],
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe('onRequest HTTP method validation', () => {
  it('returns 405 for GET requests', async () => {
    const ctx = createContext({ method: 'GET' });
    const res = await onRequest(ctx as any);
    expect(res.status).toBe(405);
  });

  it('accepts POST requests', async () => {
    mockUpstreamFetch.mockResolvedValue(upstreamResponse(fullConversationResponse));
    const ctx = createContext();
    const res = await onRequest(ctx as any);
    expect(res.status).not.toBe(405);
  });
});

describe('handleAgentsRequest API key validation', () => {
  it('returns 502 when API key is missing', async () => {
    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Hi' }] },
      '',
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.error)).toContain('MISTRAL_API_KEY');
  });
});

describe('start vs append routing', () => {
  it('starts a new conversation at /v1/conversations with model/tools/instructions', async () => {
    mockUpstreamFetch.mockResolvedValue(upstreamResponse(fullConversationResponse));
    const res = await handleAgentsRequest(
      {
        model: 'mistral-large-latest',
        instructions: 'Be helpful.',
        tools: [{ type: 'web_search' }],
        completionArgs: { temperature: 0.2 },
        inputs: [{ role: 'user', content: 'Research X' }],
      },
      MOCK_API_KEY,
    );

    expect(res.status).toBe(200);
    const [url, opts] = mockUpstreamFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/conversations');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(`Bearer ${MOCK_API_KEY}`);
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('mistral-large-latest');
    expect(body.instructions).toBe('Be helpful.');
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.completion_args).toEqual({ temperature: 0.2 });
    expect(body.stream).toBe(false);
  });

  it('appends to an existing conversation and strips forbidden fields', async () => {
    mockUpstreamFetch.mockResolvedValue(upstreamResponse(fullConversationResponse));
    const res = await handleAgentsRequest(
      {
        conversationId: 'conv_123',
        model: 'mistral-large-latest',
        instructions: 'ignored',
        tools: [{ type: 'web_search' }],
        inputs: [{ role: 'user', content: 'More please' }],
      },
      MOCK_API_KEY,
    );

    expect(res.status).toBe(200);
    const [url, opts] = mockUpstreamFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/conversations/conv_123');
    const body = JSON.parse(opts.body);
    expect(body.inputs).toEqual([{ role: 'user', content: 'More please' }]);
    expect(body.model).toBeUndefined();
    expect(body.instructions).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });

  it('returns 400 when inputs is missing', async () => {
    const res = await handleAgentsRequest({} as any, MOCK_API_KEY);
    expect(res.status).toBe(400);
  });
});

describe('normalization', () => {
  it('extracts text, citations and usage from message.output', async () => {
    mockUpstreamFetch.mockResolvedValue(upstreamResponse(fullConversationResponse));
    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Hi' }] },
      MOCK_API_KEY,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.conversationId).toBe('conv_123');
    expect(body.text).toBe('Search results overview.');
    expect(body.citations).toEqual([
      {
        title: 'Example Source',
        url: 'https://example.com',
        description: 'A snippet.',
      },
    ]);
    expect(body.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      connectorTokens: 0,
    });
  });

  it('collects tool_results from tool.execution entries', async () => {
    mockUpstreamFetch.mockResolvedValue(
      upstreamResponse({
        object: 'conversation.response',
        conversation_id: 'conv_456',
        outputs: [
          {
            type: 'tool.execution',
            name: 'code_interpreter',
            arguments: { code: 'print(6*7)' },
            info: { code: 'print(6*7)', code_output: '42', result: '42' },
          },
        ],
        usage: { total_tokens: 3 },
      }),
    );
    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Run code' }] },
      MOCK_API_KEY,
    );

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.toolResults).toEqual([
      { name: 'code_interpreter', code: 'print(6*7)', codeOutput: '42', result: '42' },
    ]);
  });

  it('falls back to the existing conversationId when upstream omits it', async () => {
    mockUpstreamFetch.mockResolvedValue(
      upstreamResponse({ object: 'conversation.response', outputs: [], usage: {} }),
    );
    const res = await handleAgentsRequest(
      { conversationId: 'conv_preset', inputs: [{ role: 'user', content: 'Hi' }] },
      MOCK_API_KEY,
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.conversationId).toBe('conv_preset');
  });
});

describe('image download', () => {
  it('downloads tool_file images and sniffs the real mime from magic bytes', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    mockUpstreamFetch
      .mockResolvedValueOnce(
        upstreamResponse({
          object: 'conversation.response',
          conversation_id: 'conv_img',
          outputs: [
            {
              type: 'message.output',
              content: [
                {
                  type: 'tool_file',
                  tool: 'image_generation',
                  file_id: 'file_1',
                  file_name: 'diagram.png',
                  file_type: 'png',
                },
              ],
            },
          ],
          usage: {},
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(jpeg.buffer),
      });

    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Make a diagram' }], downloadImages: true },
      MOCK_API_KEY,
    );

    const [fileUrl] = mockUpstreamFetch.mock.calls[1];
    expect(fileUrl).toBe('https://api.mistral.ai/v1/files/file_1/content');
    const body = (await res.json()) as Record<string, unknown>;
    const images = body.images as Array<Record<string, unknown>>;
    expect(images).toHaveLength(1);
    expect(images[0].fileId).toBe('file_1');
    expect(images[0].fileName).toBe('diagram.png');
    expect(images[0].mime).toBe('image/jpeg');
    expect(images[0].base64).toBeTruthy();
  });

  it('does not attempt image download when downloadImages is false', async () => {
    mockUpstreamFetch.mockResolvedValue(
      upstreamResponse({
        object: 'conversation.response',
        conversation_id: 'conv_img',
        outputs: [
          {
            type: 'message.output',
            content: [
              { type: 'tool_file', tool: 'image_generation', file_id: 'file_1' },
            ],
          },
        ],
        usage: {},
      }),
    );

    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'x' }], downloadImages: false },
      MOCK_API_KEY,
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.images).toEqual([]);
    expect(mockUpstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('skips a failed file download without failing the whole response', async () => {
    mockUpstreamFetch
      .mockResolvedValueOnce(
        upstreamResponse({
          object: 'conversation.response',
          conversation_id: 'conv_img',
          outputs: [
            {
              type: 'message.output',
              content: [
                { type: 'tool_file', tool: 'image_generation', file_id: 'file_bad' },
              ],
            },
          ],
          usage: {},
        }),
      )
      .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('') });

    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'x' }] },
      MOCK_API_KEY,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.images).toEqual([]);
  });
});

describe('error passthrough', () => {
  it('forwards upstream non-ok status and body verbatim', async () => {
    mockUpstreamFetch.mockResolvedValue(
      upstreamResponse({ error: 'rate limited' }, 429),
    );
    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Hi' }] },
      MOCK_API_KEY,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('rate limited');
  });

  it('returns 502 on network failure to upstream', async () => {
    mockUpstreamFetch.mockRejectedValue(new Error('Connection refused'));
    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Hi' }] },
      MOCK_API_KEY,
    );
    expect(res.status).toBe(502);
  });

  it('returns 502 on unparseable upstream body', async () => {
    mockUpstreamFetch.mockResolvedValue(upstreamResponse('<html>oops</html>'));
    const res = await handleAgentsRequest(
      { inputs: [{ role: 'user', content: 'Hi' }] },
      MOCK_API_KEY,
    );
    expect(res.status).toBe(502);
  });
});
