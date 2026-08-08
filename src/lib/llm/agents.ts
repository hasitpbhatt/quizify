import { AuthError, NetworkError, RateLimitError } from './errors';
import { getContentModel } from './providers';
import { anySignal, timeoutSignal } from './utils';
import { debugLog } from '@/lib/debug';
import type { ChatMessage } from '@/shared/types';

export type AgentToolType = 'web_search' | 'image_generation' | 'code_interpreter';

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

export interface AgentResponse {
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

export interface AgentRequestOptions {
  conversationId?: string;
  model?: string;
  instructions?: string;
  tools?: AgentToolType[];
  completionArgs?: Record<string, unknown>;
  downloadImages?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const AGENT_API = '/api/agents';
const AGENT_TIMEOUT_MS = 120_000;

async function extractErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown; detail?: unknown };
      const detail = parsed?.detail ?? parsed?.error;
      if (detail) return `: ${String(detail).slice(0, 300)}`;
    } catch {
      if (text && text.length < 300) return `: ${text}`;
    }
  } catch {}
  return '';
}

export async function agentRequest(
  inputs: ChatMessage[],
  opts: AgentRequestOptions = {},
): Promise<AgentResponse> {
  const {
    conversationId,
    model = getContentModel(),
    instructions,
    tools,
    completionArgs,
    downloadImages = true,
    signal: userSignal,
    timeoutMs = AGENT_TIMEOUT_MS,
  } = opts;

  const ac = new AbortController();
  const signal = anySignal(userSignal, timeoutSignal(timeoutMs), ac.signal);

  const body: Record<string, unknown> = { inputs, downloadImages };
  if (conversationId) body.conversationId = conversationId;
  if (model) body.model = model;
  if (instructions) body.instructions = instructions;
  if (tools && tools.length > 0) body.tools = tools.map((t) => ({ type: t }));
  if (completionArgs) body.completionArgs = completionArgs;

  debugLog(
    'log',
    'agents',
    'POST %s conv=%s tools=%s',
    AGENT_API,
    conversationId ?? 'new',
    tools?.join(',') ?? 'none',
  );

  let res: Response;
  try {
    res = await fetch(AGENT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (userSignal?.aborted || ac.signal.aborted) throw err as Error;
    debugLog('warn', 'agents', 'network error %s', String(err));
    throw new NetworkError('Agents request failed');
  }

  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (res.status === 429) throw new RateLimitError();

  if (!res.ok) {
    const detail = await extractErrorDetail(res);
    throw new NetworkError(`Agents returned ${res.status}${detail}`);
  }

  try {
    return (await res.json()) as AgentResponse;
  } catch {
    throw new NetworkError('Agents returned an unparseable response');
  }
}

export interface WebSearchResult {
  content: string;
  citations: AgentCitation[];
  conversationId: string;
}

export async function fetchSourceWithWebSearch(
  subject: string,
  opts: { conversationId?: string; signal?: AbortSignal } = {},
): Promise<WebSearchResult> {
  const instructions =
    `You are a research assistant for a university study tool. The user wants to learn about: "${subject}". ` +
    `Use web_search to gather authoritative, current information, then produce a detailed educational overview ` +
    `covering key definitions, core concepts, important examples, common pitfalls, and real-world applications. ` +
    `Output only the content, no disclaimers. Format in clear paragraphs with section headers.`;

  const response = await agentRequest(
    [{ role: 'user', content: `Research and summarize learning material on "${subject}".` }],
    {
      conversationId: opts.conversationId,
      instructions,
      tools: ['web_search'],
      signal: opts.signal,
    },
  );

  return {
    content: response.text,
    citations: response.citations,
    conversationId: response.conversationId,
  };
}

export interface ConceptImageResult {
  blob: Blob;
  mime: string;
  fileName?: string;
  conversationId: string;
}

export async function generateConceptImage(
  conceptTitle: string,
  topic: string,
  opts: { conversationId?: string; signal?: AbortSignal } = {},
): Promise<ConceptImageResult> {
  const instructions =
    `You are an educational illustrator for a university study tool. ` +
    `Generate ONE clean, explanatory diagram or infographic that helps a student understand the concept. ` +
    `The concept is "${conceptTitle}" within the topic "${topic}". Make it readable, labeled, and self-contained.`;

  const response = await agentRequest(
    [{ role: 'user', content: `Create an explanatory diagram for the concept "${conceptTitle}".` }],
    {
      conversationId: opts.conversationId,
      instructions,
      tools: ['image_generation'],
      downloadImages: true,
      signal: opts.signal,
    },
  );

  const image = response.images?.[0];
  if (!image?.base64) {
    throw new NetworkError('No image produced by image_generation tool');
  }

  const binStr = atob(image.base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

  return {
    blob: new Blob([bytes], { type: image.mime }),
    mime: image.mime,
    fileName: image.fileName,
    conversationId: response.conversationId,
  };
}

export interface CodeWorkbenchResult {
  text: string;
  code?: string;
  codeOutput?: string;
  conversationId: string;
}

export async function runCodeWorkbench(
  conceptTitle: string,
  topic: string,
  opts: { conversationId?: string; signal?: AbortSignal } = {},
): Promise<CodeWorkbenchResult> {
  const instructions =
    `You are assisting a university student. For the concept "${conceptTitle}" in the topic "${topic}", ` +
    `use the code_interpreter tool ONLY if it involves computation (numerical examples, formulas, data, calculations) ` +
    `that can be verified by executing code. If it does, execute the code to verify a worked example, then ` +
    `explain the result in a short paragraph. If computation is not relevant, reply with a single sentence ` +
    `stating that no computation applies.`;

  const response = await agentRequest(
    [
      {
        role: 'user',
        content: `Verify any computation for the concept "${conceptTitle}" with code.`,
      },
    ],
    {
      conversationId: opts.conversationId,
      instructions,
      tools: ['code_interpreter'],
      downloadImages: false,
      signal: opts.signal,
    },
  );

  const execution = response.toolResults.find((t) => t.name === 'code_interpreter');
  return {
    text: response.text,
    code: execution?.code,
    codeOutput: execution?.codeOutput,
    conversationId: response.conversationId,
  };
}
