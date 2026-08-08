import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  agentRequest,
  fetchSourceWithWebSearch,
  generateConceptImage,
  runCodeWorkbench,
} from '@/lib/llm/agents';
import { AuthError, NetworkError, RateLimitError } from '@/lib/llm/errors';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agentRequest', () => {
  it('POSTs inputs and returns the normalized response', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        conversationId: 'conv_1',
        text: 'Overview',
        citations: [{ title: 'Src', url: 'https://e.com' }],
        toolResults: [],
        images: [],
      }),
    );

    const res = await agentRequest([{ role: 'user', content: 'Hi' }], { model: 'mistral-small-latest' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/agents');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('mistral-small-latest');
    expect(body.inputs).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(body.downloadImages).toBe(true);

    expect(res.conversationId).toBe('conv_1');
    expect(res.text).toBe('Overview');
  });

  it('includes tools and instructions when provided', async () => {
    mockFetch.mockResolvedValue(
      okJson({ conversationId: 'c', text: '', citations: [], toolResults: [], images: [] }),
    );
    await agentRequest([{ role: 'user', content: 'x' }], {
      tools: ['web_search'],
      instructions: 'Research',
      conversationId: 'conv_prev',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.conversationId).toBe('conv_prev');
    expect(body.instructions).toBe('Research');
    expect(body.tools).toEqual([{ type: 'web_search' }]);
  });

  it('throws AuthError on 401', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 401 }));
    await expect(agentRequest([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(AuthError);
  });

  it('throws RateLimitError on 429', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 429 }));
    await expect(agentRequest([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws NetworkError on 5xx', async () => {
    mockFetch.mockResolvedValue(new Response('boom', { status: 502 }));
    await expect(agentRequest([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws NetworkError when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(agentRequest([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('fetchSourceWithWebSearch', () => {
  it('returns content and citations', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        conversationId: 'conv_s',
        text: 'Educational overview paragraphs.',
        citations: [{ title: 'Wikipedia', url: 'https://wikipedia.org', description: 'd' }],
        toolResults: [],
        images: [],
      }),
    );

    const res = await fetchSourceWithWebSearch('quantum computing');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(String(body.instructions)).toContain('quantum computing');
    expect(res.content).toContain('Educational overview');
    expect(res.citations[0].title).toBe('Wikipedia');
    expect(res.conversationId).toBe('conv_s');
  });
});

describe('generateConceptImage', () => {
  it('decodes base64 into a Blob with the sniffed mime', async () => {
    const base64 = btoa('fake-image-bytes');
    mockFetch.mockResolvedValue(
      okJson({
        conversationId: 'conv_img',
        text: '',
        citations: [],
        toolResults: [],
        images: [
          { fileId: 'file_1', fileName: 'diagram.png', mime: 'image/png', base64 },
        ],
      }),
    );

    const res = await generateConceptImage('Photosynthesis', 'Biology');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([{ type: 'image_generation' }]);
    expect(res.blob.type).toBe('image/png');
    expect(res.blob.size).toBe(Buffer.byteLength('fake-image-bytes', 'utf8'));
    expect(res.mime).toBe('image/png');
  });

  it('throws NetworkError when no image was produced', async () => {
    mockFetch.mockResolvedValue(
      okJson({ conversationId: 'c', text: '', citations: [], toolResults: [], images: [] }),
    );
    await expect(generateConceptImage('X', 'Y')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('runCodeWorkbench', () => {
  it('extracts the code_interpreter execution result', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        conversationId: 'conv_code',
        text: 'Verified.',
        citations: [],
        toolResults: [
          { name: 'code_interpreter', code: 'print(2+2)', codeOutput: '4' },
        ],
        images: [],
      }),
    );

    const res = await runCodeWorkbench('Derivatives', 'Calculus');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([{ type: 'code_interpreter' }]);
    expect(body.downloadImages).toBe(false);
    expect(res.code).toBe('print(2+2)');
    expect(res.codeOutput).toBe('4');
  });

  it('returns empty execution when the model did not use the tool', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        conversationId: 'c',
        text: 'No computation applies.',
        citations: [],
        toolResults: [],
        images: [],
      }),
    );
    const res = await runCodeWorkbench('History', 'Topic');
    expect(res.code).toBeUndefined();
  });
});
