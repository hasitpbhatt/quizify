export interface AgentCitation {
  title: string;
  url?: string;
  description?: string;
}

export interface AgentImage {
  fileId: string;
  fileName?: string;
  fileType?: string;
  mime: string;
  base64: string;
}

export interface AgentToolResult {
  name: string;
  code?: string;
  codeOutput?: string;
  result?: unknown;
}

export interface AgentNormalized {
  conversationId: string;
  text: string;
  citations: AgentCitation[];
  toolResults: AgentToolResult[];
  images: AgentImage[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    connectorTokens?: number;
  };
}

export interface AgentRequestBody {
  conversationId?: string;
  model?: string;
  instructions?: string;
  tools?: Array<{ type: string; tool_configuration?: unknown }>;
  inputs: Array<{ role: string; content: unknown }>;
  completionArgs?: Record<string, unknown>;
  downloadImages?: boolean;
}

const API_BASE = 'https://api.mistral.ai';
const UPSTREAM_TIMEOUT_MS = 120_000;

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function upstreamFetch(path: string, body: unknown, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface RawOutput {
  // message.output entries
  content?: unknown;
  // tool.execution entries
  name?: string;
  arguments?: { code?: string };
  info?: { code?: string; code_output?: string; result?: unknown };
  type?: string;
}

interface RawConversationResponse {
  conversation_id?: string;
  outputs?: RawOutput[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    connector_tokens?: number;
  };
}

function isTextChunk(chunk: unknown): boolean {
  const c = chunk as Record<string, unknown>;
  return typeof c?.text === 'string';
}

function collectFromContent(
  content: unknown,
  acc: { text: string; citations: AgentCitation[]; fileRefs: Array<{ fileId: string; fileName?: string; fileType?: string }> },
): void {
  if (typeof content === 'string') {
    acc.text += content;
    return;
  }
  if (!Array.isArray(content)) return;
  for (const chunk of content) {
    if (!chunk || typeof chunk !== 'object') continue;
    const c = chunk as Record<string, unknown>;
    if (c.type === 'tool_reference' && typeof c.title === 'string') {
      acc.citations.push({
        title: c.title,
        url: typeof c.url === 'string' ? c.url : undefined,
        description: typeof c.description === 'string' ? c.description : undefined,
      });
    } else if (c.type === 'tool_file' && typeof c.file_id === 'string') {
      acc.fileRefs.push({
        fileId: c.file_id,
        fileName: typeof c.file_name === 'string' ? c.file_name : undefined,
        fileType: typeof c.file_type === 'string' ? c.file_type : undefined,
      });
    } else if (isTextChunk(chunk)) {
      acc.text += (chunk as { text: string }).text;
    }
  }
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function mapUsage(usage?: RawConversationResponse['usage']): AgentNormalized['usage'] {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    connectorTokens: usage.connector_tokens ?? 0,
  };
}

export async function handleAgentsRequest(jsonBody: AgentRequestBody, apiKey: string): Promise<Response> {
  if (!apiKey) {
    return jsonError(502, 'Default provider unavailable — no server-side Mistral key configured (set MISTRAL_API_KEY).');
  }

  const { conversationId, model, instructions, tools, inputs, completionArgs } = jsonBody;
  const downloadImages = jsonBody.downloadImages ?? true;

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return jsonError(400, 'Missing inputs array.');
  }

  let upstream: Response;
  if (conversationId) {
    // Append: tools/instructions/model are fixed at conversation start and rejected here.
    const appendBody: Record<string, unknown> = { inputs, stream: false };
    if (completionArgs) appendBody.completion_args = completionArgs;
    try {
      upstream = await upstreamFetch(`/v1/conversations/${encodeURIComponent(conversationId)}`, appendBody, apiKey);
    } catch {
      return jsonError(502, 'Upstream Mistral request failed.');
    }
  } else {
    const startBody: Record<string, unknown> = { inputs, stream: false };
    if (model) startBody.model = model;
    if (instructions) startBody.instructions = instructions;
    if (Array.isArray(tools) && tools.length > 0) startBody.tools = tools;
    if (completionArgs) startBody.completion_args = completionArgs;
    try {
      upstream = await upstreamFetch('/v1/conversations', startBody, apiKey);
    } catch {
      return jsonError(502, 'Upstream Mistral request failed.');
    }
  }

  const rawText = await upstream.text();

  if (!upstream.ok) {
    return new Response(rawText, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let raw: RawConversationResponse;
  try {
    raw = JSON.parse(rawText) as RawConversationResponse;
  } catch {
    return jsonError(502, 'Upstream Mistral returned an unparseable response.');
  }

  const acc: { text: string; citations: AgentCitation[]; fileRefs: Array<{ fileId: string; fileName?: string; fileType?: string }> } = {
    text: '',
    citations: [],
    fileRefs: [],
  };
  const toolResults: AgentToolResult[] = [];

  for (const entry of raw.outputs ?? []) {
    if (entry && typeof entry === 'object') {
      const isToolExecution = entry.name !== undefined || entry.arguments !== undefined || entry.info !== undefined;
      if (isToolExecution) {
        const code = entry.arguments?.code ?? entry.info?.code;
        toolResults.push({
          name: entry.name ?? '',
          code,
          codeOutput: entry.info?.code_output,
          result: entry.info?.result,
        });
      } else if (entry.content !== undefined) {
        collectFromContent(entry.content, acc);
      }
    }
  }

  const images: AgentImage[] = [];
  if (downloadImages && acc.fileRefs.length > 0) {
    for (const ref of acc.fileRefs) {
      try {
        const fileRes = await fetch(`${API_BASE}/v1/files/${encodeURIComponent(ref.fileId)}/content`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!fileRes.ok) continue;
        const buf = await fileRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        images.push({
          fileId: ref.fileId,
          fileName: ref.fileName,
          fileType: ref.fileType,
          mime: sniffMime(bytes),
          base64: bytesToBase64(bytes),
        });
      } catch {
        // skip a failed image download; keep the rest of the response usable
      }
    }
  }

  const normalized: AgentNormalized = {
    conversationId: raw.conversation_id ?? conversationId ?? '',
    text: acc.text,
    citations: acc.citations,
    toolResults,
    images,
    usage: mapUsage(raw.usage),
  };

  return new Response(JSON.stringify(normalized), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}