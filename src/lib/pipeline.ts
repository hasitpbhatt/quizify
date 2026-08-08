import {
  SUMMARY_NODE_ID,
  type Persona,
  type CanvasNode,
  type CanvasEdge,
  type ConceptData,
  type QuizData,
  type SummaryData,
  type NoteData,
  type ImageData,
} from '@/shared/types';
import { executePromptTask } from '@/lib/llm/promptTask';
import { contentTask } from '@/lib/tasks/contentTask';
import { quizTask } from '@/lib/tasks/quizTask';
import { summaryTask } from '@/lib/tasks/summaryTask';
import {
  getContentModelAt,
  getQuizModel,
  getSummaryModelAt,
  CONTENT_MODEL_CASCADE,
  SUMMARY_MODEL_CASCADE,
} from '@/lib/llm/providers';
import { generateConceptImage, runCodeWorkbench } from '@/lib/llm/agents';
import { putImage } from '@/lib/db/imagesDb';
import { debugLog } from '@/lib/debug';
import type { QuizItem } from '@/lib/llm/contentParser';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useToastStore } from '@/shared/stores/toastStore';
import * as sessionsDb from '@/lib/db/sessionsDb';

export type PipelineStep = 'detail' | 'quiz' | 'summary' | 'build' | 'done' | 'error';

export interface PipelineProgress {
  step: PipelineStep;
  label: string;
  error?: string;
}

type ProgressCallback = (progress: PipelineProgress) => void;

export interface RateLimitState {
  consecutive429s: number;
  last429At: number;
  contentModelIndex: number;
  summaryModelIndex: number;
}

export function createRateLimitState(): RateLimitState {
  return { consecutive429s: 0, last429At: 0, contentModelIndex: 0, summaryModelIndex: 0 };
}

export function resetIfCooled(state: RateLimitState): void {
  if (state.last429At > 0 && Date.now() - state.last429At > 60000) {
    state.consecutive429s = 0;
    state.contentModelIndex = 0;
    state.summaryModelIndex = 0;
    state.last429At = 0;
  }
}

export function quizItemToQuizData(item: QuizItem, conceptId: string): QuizData {
  return { kind: 'quiz', parentConceptId: conceptId, attempts: [], state: 'untested', ...item };
}

export function createMutex() {
  let p: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> =>
    (p = p.then(
      () => fn(),
      () => fn(),
    )) as Promise<T>;
}

export interface ConceptInfo {
  id: string;
  title: string;
  explanation: string;
  example: string;
}

export function pushConceptShells(
  nodes: CanvasNode[],
  concepts: Array<{ id: string; title: string; explanation: string }>,
  sourceUrl?: string,
): void {
  concepts.forEach((concept, i) => {
    nodes.push({
      id: concept.id,
      type: 'concept',
      data: {
        kind: 'concept',
        index: i,
        title: concept.title,
        explanation: concept.explanation,
        example: 'Loading...',
        generationStatus: 'generating',
        sourceUrl,
      } satisfies ConceptData,
    });
  });
}

export async function processOneConcept(
  nodes: CanvasNode[],
  _edges: CanvasEdge[],
  generatedConcepts: ConceptInfo[],
  concept: { id: string; title: string; explanation: string },
  _index: number,
  topic: string,
  persona: Persona,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
  onNotify: (step: PipelineStep, label: string, error?: string) => void,
  rateLimitState?: RateLimitState,
  model?: string,
): Promise<string | null> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const nodeIndexById = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) nodeIndexById.set(nodes[i].id, i);

  const streamingState = { lastPersist: 0 };
  const nodeIdx = nodeIndexById.get(concept.id);
  const onToken = () => {
    const now = Date.now();
    if (now - streamingState.lastPersist < 200) return;
    streamingState.lastPersist = now;
    if (nodeIdx === undefined || nodeIdx === -1) return;
    nodes[nodeIdx] = {
      ...nodes[nodeIdx],
      data: { ...nodes[nodeIdx].data, streaming: true } as ConceptData,
    };
    persist();
  };

  const conceptStart = performance.now();
  debugLog('log', 'pipeline', 'concept start id=%s title=%s', concept.id, concept.title);

  let modelIndex = rateLimitState?.contentModelIndex ?? 0;
  const maxModels = rateLimitState ? CONTENT_MODEL_CASCADE.length : 1;
  let lastError: Error | null = null;

  while (modelIndex < maxModels) {
    const currentModel = model ?? getContentModelAt(modelIndex);
    const startedAt = Date.now();
    try {
      const content = await executePromptTask(
        contentTask,
        {
          persona,
          signal,
          context: { topic },
          model: currentModel,
          onToken,
          onRetry: (info) => {
            if (rateLimitState && info.status === 429) {
              rateLimitState.last429At = Date.now();
              rateLimitState.consecutive429s++;
            } else if (rateLimitState) {
              rateLimitState.consecutive429s = 0;
            }
            useToastStore
              .getState()
              .add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`);
          },
          onParseRetry: (raw) =>
            console.warn(
              `[pipeline] ParseError for concept ${concept.id}, retrying. Raw:\n${raw.slice(0, 500)}`,
            ),
        },
        concept,
      );

      generatedConcepts.push({
        id: concept.id,
        title: concept.title,
        explanation: content.detail.explanation,
        example: content.detail.example,
      });

      const nodeIndex = nodeIndexById.get(concept.id) ?? -1;
      if (nodeIndex !== -1) {
        nodes[nodeIndex] = {
          ...nodes[nodeIndex],
          data: {
            ...nodes[nodeIndex].data,
            explanation: content.detail.explanation,
            example: content.detail.example,
            streaming: false,
            generationStatus: 'ready',
            generationError: undefined,
          } as ConceptData,
        };
      }

      persist();
      const conceptElapsed = Math.round(performance.now() - conceptStart);
      debugLog('log', 'pipeline', 'concept done id=%s elapsed=%dms', concept.id, conceptElapsed);
      return concept.id;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      const elapsed = Date.now() - startedAt;

      debugLog(
        'warn',
        'pipeline',
        'concept model=%s FAIL id=%s title=%s elapsed=%dms err=%s',
        currentModel,
        concept.id,
        concept.title,
        elapsed,
        lastError.message,
      );

      if (rateLimitState) {
        rateLimitState.last429At = Date.now();
        rateLimitState.consecutive429s++;
        // Monotonic: content workers run concurrently, so never let a straggler
        // on a lower tier downgrade the shared cascade index another worker raised.
        rateLimitState.contentModelIndex = Math.max(
          rateLimitState.contentModelIndex,
          modelIndex + 1,
        );
        if (rateLimitState.contentModelIndex >= CONTENT_MODEL_CASCADE.length) {
          rateLimitState.contentModelIndex = CONTENT_MODEL_CASCADE.length - 1;
        }
      }

      modelIndex++;
      if (modelIndex < maxModels) {
        useToastStore.getState().add(`Model ${currentModel} failed, trying next tier\u2026`);
      }
    }
  }

  debugLog(
    'error',
    'pipeline',
    'concept FAIL id=%s title=%s all models exhausted err=%s',
    concept.id,
    concept.title,
    lastError?.message ?? 'Unknown error',
  );
  onNotify('error', `Failed to load ${concept.title}`, lastError?.message ?? 'Unknown error');
  if (nodeIdx !== undefined && nodeIdx !== -1) {
    nodes[nodeIdx] = {
      ...nodes[nodeIdx],
      data: {
        ...nodes[nodeIdx].data,
        streaming: false,
        generationStatus: 'failed',
        generationError: lastError?.message ?? 'Unknown error',
      } as ConceptData,
    };
    await persist();
  }
  return null;
}

export async function runWithConcurrency(
  items: Array<{ id: string; title: string; explanation: string }>,
  getConcurrency: () => number,
  fn: (item: { id: string; title: string; explanation: string }, index: number) => Promise<void>,
): Promise<void> {
  const poolAbort = new AbortController();

  const safeFn = async (item: { id: string; title: string; explanation: string }, i: number) => {
    if (poolAbort.signal.aborted) return;
    try {
      await fn(item, i);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        poolAbort.abort(err);
        return;
      }
      throw err;
    }
  };

  const initialConcurrency = getConcurrency();
  if (initialConcurrency >= items.length) {
    const results = await Promise.allSettled(items.map((item, i) => safeFn(item, i)));
    if (poolAbort.signal.aborted) throw poolAbort.signal.reason;
    for (const r of results) {
      if (r.status === 'rejected') throw r.reason;
    }
  } else {
    let next = 0;
    const workers = Array.from({ length: initialConcurrency }, async (_, workerIndex) => {
      while (next < items.length && !poolAbort.signal.aborted) {
        if (workerIndex >= getConcurrency()) return;
        const i = next++;
        await safeFn(items[i], i);
      }
    });
    await Promise.all(workers);
    if (poolAbort.signal.aborted) throw poolAbort.signal.reason;
  }
}

export async function runContentPhase(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  generatedConcepts: ConceptInfo[],
  conceptLastNodeIds: (string | null)[],
  concepts: Array<{ id: string; title: string; explanation: string }>,
  topic: string,
  persona: Persona,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
  onNotify: (step: PipelineStep, label: string, error?: string) => void,
  rateLimitState: RateLimitState,
  sessionId?: string,
): Promise<number> {
  const total = concepts.length;
  let completed = 0;
  let failed = 0;
  onNotify('detail', `Generating content (0/${total} done\u2026)`);

  await runWithConcurrency(
    concepts,
    () => 3,
    async (concept, i) => {
      const lastNodeId = await processOneConcept(
        nodes,
        edges,
        generatedConcepts,
        concept,
        i,
        topic,
        persona,
        signal,
        persist,
        onNotify,
        rateLimitState,
      );
      conceptLastNodeIds[i] = lastNodeId;
      if (lastNodeId) {
        // Interleave: generate this concept's quizzes as soon as its content
        // lands so it becomes answerable before the rest of the lesson finishes
        // (first practice no longer waits for the full content phase).
        const conceptInfo = generatedConcepts.find((c) => c.id === concept.id);
        await generateQuizForConcept(
          nodes,
          conceptInfo,
          topic,
          persona,
          signal,
          persist,
          rateLimitState,
        );
        // Agent enrichments (code workbench + diagram) run after the quiz tail
        // persists so they never delay first practice; each is non-fatal.
        await enrichConceptWithAgents(nodes, conceptInfo, topic, sessionId, signal, persist);
      }
      if (!lastNodeId) failed++;
      completed++;
      onNotify('detail', `Generating content (${completed}/${total} done\u2026)`);
    },
  );
  return failed;
}

/**
 * Generate quizzes for a single concept and splice them right after its node,
 * then persist. Non-fatal on failure (the concept stays, just without quizzes,
 * which progression treats as auto-pass). Idempotent: skips concepts that
 * already have quizzes.
 */
export async function generateQuizForConcept(
  nodes: CanvasNode[],
  conceptInfo: ConceptInfo | undefined,
  topic: string,
  persona: Persona,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
  rateLimitState?: RateLimitState,
): Promise<void> {
  if (!conceptInfo) return;
  if (
    nodes.some(
      (n) => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === conceptInfo.id,
    )
  ) {
    return;
  }
  try {
    const quizzes = await executePromptTask(
      quizTask,
      {
        persona,
        signal,
        context: { topic },
        model: getQuizModel(),
        onRetry: (info) => {
          if (rateLimitState && info.status === 429) {
            rateLimitState.last429At = Date.now();
            rateLimitState.consecutive429s++;
          }
          useToastStore
            .getState()
            .add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`);
        },
      },
      conceptInfo,
    );
    if (!Array.isArray(quizzes) || quizzes.length === 0) return;
    // find + splice synchronously so a concurrently-generating sibling can't
    // shift this concept's index between the lookup and the inserts.
    const conceptIdx = nodes.findIndex((n) => n.id === conceptInfo.id);
    if (conceptIdx === -1) return;
    quizzes.forEach((item, qi) => {
      nodes.splice(conceptIdx + 1 + qi, 0, {
        id: `${conceptInfo.id}-quiz-${qi}`,
        type: 'quiz',
        data: quizItemToQuizData(item, conceptInfo.id),
      });
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    debugLog(
      'warn',
      'pipeline',
      'quiz FAIL concept=%s err=%s',
      conceptInfo.id,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await persist();
  }
}

/**
 * Index just past a concept's node and any quiz/image/note children spliced
 * after it, so agent enrichments insert after the whole block.
 */
function findConceptTailIndex(nodes: CanvasNode[], conceptId: string): number {
  const conceptIdx = nodes.findIndex((n) => n.id === conceptId);
  if (conceptIdx === -1) return nodes.length;
  let idx = conceptIdx + 1;
  while (idx < nodes.length) {
    const d = nodes[idx].data;
    const belongs =
      (d.kind === 'quiz' && d.parentConceptId === conceptId) ||
      (d.kind === 'image' && d.parentConceptId === conceptId) ||
      (d.kind === 'note' && d.linkedConceptId === conceptId);
    if (!belongs) break;
    idx++;
  }
  return idx;
}

async function persistAgentConversation(
  sessionId: string | undefined,
  conceptId: string,
  kind: 'image' | 'code',
  conversationId: string,
): Promise<void> {
  if (!sessionId || !conversationId) return;
  const session = await sessionsDb.getSession(sessionId);
  if (!session) return;
  const concepts = { ...session.agentConversations?.concepts };
  const entry = { ...concepts[conceptId] };
  entry[kind] = conversationId;
  concepts[conceptId] = entry;
  await useSessionStore
    .getState()
    .updateCurrent({ agentConversations: { ...session.agentConversations, concepts } }, sessionId);
}

async function getAgentConversationId(
  sessionId: string | undefined,
  conceptId: string,
  kind: 'image' | 'code',
): Promise<string | undefined> {
  if (!sessionId) return undefined;
  const session = await sessionsDb.getSession(sessionId);
  return session?.agentConversations?.concepts?.[conceptId]?.[kind];
}

/**
 * Code-interpreter workbench for a concept: the model decides whether the
 * concept involves computation; if it returns code + output, a `note` node
 * with the verified example is spliced after the concept's quiz tail.
 * Non-fatal. The conversation id is persisted for stateful follow-ups.
 */
export async function enrichConceptWithCode(
  nodes: CanvasNode[],
  conceptInfo: ConceptInfo | undefined,
  topic: string,
  sessionId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!conceptInfo) return;
  if (
    nodes.some(
      (n) => n.data.kind === 'note' && (n.data as NoteData).linkedConceptId === conceptInfo.id,
    )
  ) {
    return;
  }

  let result: Awaited<ReturnType<typeof runCodeWorkbench>>;
  try {
    const conversationId = await getAgentConversationId(sessionId, conceptInfo.id, 'code');
    result = await runCodeWorkbench(conceptInfo.title, topic, { conversationId, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    debugLog(
      'warn',
      'pipeline',
      'code workbench FAIL concept=%s err=%s',
      conceptInfo.id,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  if (!result.code || !result.codeOutput) return;

  await persistAgentConversation(sessionId, conceptInfo.id, 'code', result.conversationId);

  const tail = findConceptTailIndex(nodes, conceptInfo.id);
  nodes.splice(tail, 0, {
    id: `${conceptInfo.id}-workbench`,
    type: 'note',
    data: {
      kind: 'note',
      linkedConceptId: conceptInfo.id,
      text: `Worked example (verified by computation)\n\n${result.code}\n\n${result.codeOutput}`,
    },
  });
}

/**
 * Image-generation diagram for a concept: stores the blob in the IDB `images`
 * store and splices an `image` node after the concept's quiz tail.
 * Non-fatal. The conversation id is persisted for regeneration follow-ups.
 */
export async function enrichConceptWithImage(
  nodes: CanvasNode[],
  conceptInfo: ConceptInfo | undefined,
  topic: string,
  sessionId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!conceptInfo) return;
  if (
    nodes.some(
      (n) => n.data.kind === 'image' && (n.data as ImageData).parentConceptId === conceptInfo.id,
    )
  ) {
    return;
  }

  let result: Awaited<ReturnType<typeof generateConceptImage>>;
  try {
    const conversationId = await getAgentConversationId(sessionId, conceptInfo.id, 'image');
    result = await generateConceptImage(conceptInfo.title, topic, { conversationId, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    debugLog(
      'warn',
      'pipeline',
      'image FAIL concept=%s err=%s',
      conceptInfo.id,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  if (sessionId) {
    try {
      await putImage(sessionId, `${conceptInfo.id}-diagram`, result.blob, result.mime);
    } catch (err) {
      debugLog(
        'warn',
        'pipeline',
        'image store FAIL concept=%s err=%s',
        conceptInfo.id,
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
  }

  await persistAgentConversation(sessionId, conceptInfo.id, 'image', result.conversationId);

  const nodeId = `${conceptInfo.id}-diagram`;
  const tail = findConceptTailIndex(nodes, conceptInfo.id);
  nodes.splice(tail, 0, {
    id: nodeId,
    type: 'image',
    data: {
      kind: 'image',
      parentConceptId: conceptInfo.id,
      caption: `Diagram: ${conceptInfo.title}`,
      blobKey: sessionId ? `${sessionId}:${nodeId}` : nodeId,
      mime: result.mime,
      fileName: result.fileName,
    },
  });
}

/**
 * Run the non-blocking agent enrichments (code workbench, then image diagram)
 * for a concept and persist the spliced nodes. Non-fatal per enrichment.
 */
export async function enrichConceptWithAgents(
  nodes: CanvasNode[],
  conceptInfo: ConceptInfo | undefined,
  topic: string,
  sessionId: string | undefined,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
): Promise<void> {
  if (!conceptInfo) return;
  await enrichConceptWithCode(nodes, conceptInfo, topic, sessionId, signal);
  await enrichConceptWithImage(nodes, conceptInfo, topic, sessionId, signal);
  await persist();
}

export async function pushSummary(
  nodes: CanvasNode[],
  generatedConcepts: ConceptInfo[],
  topic: string,
  persona: Persona,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
  onNotify: (step: PipelineStep, label: string, error?: string) => void,
  rateLimitState?: RateLimitState,
): Promise<void> {
  if (generatedConcepts.length === 0) return;

  onNotify('summary', 'Creating summary & final quiz\u2026');

  let modelIndex = rateLimitState?.summaryModelIndex ?? 0;
  const maxModels = rateLimitState ? SUMMARY_MODEL_CASCADE.length : 1;
  let lastError: Error | null = null;

  while (modelIndex < maxModels) {
    const currentModel = getSummaryModelAt(modelIndex);
    try {
      const parsed = await executePromptTask(
        summaryTask,
        {
          persona,
          signal,
          context: { topic },
          model: currentModel,
          onRetry: (info) => {
            if (rateLimitState && info.status === 429) {
              rateLimitState.last429At = Date.now();
              rateLimitState.consecutive429s++;
            }
            useToastStore
              .getState()
              .add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`);
          },
        },
        generatedConcepts,
      );

      const summaryData: SummaryData = {
        kind: 'summary',
        recap: parsed.recap,
        finalQuiz: parsed.finalQuiz.map((item) => quizItemToQuizData(item, SUMMARY_NODE_ID)),
      };

      nodes.push({
        id: SUMMARY_NODE_ID,
        type: 'summary',
        data: summaryData,
      });

      await persist();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));

      debugLog(
        'warn',
        'pipeline',
        'summary model=%s FAIL (non-fatal) err=%s',
        currentModel,
        lastError.message,
      );

      if (rateLimitState) {
        rateLimitState.last429At = Date.now();
        rateLimitState.consecutive429s++;
        rateLimitState.summaryModelIndex = modelIndex + 1;
        if (rateLimitState.summaryModelIndex >= SUMMARY_MODEL_CASCADE.length) {
          rateLimitState.summaryModelIndex = SUMMARY_MODEL_CASCADE.length - 1;
        }
      }

      modelIndex++;
      if (modelIndex < maxModels) {
        useToastStore.getState().add(`Summary model ${currentModel} failed, trying next\u2026`);
      }
    }
  }

  debugLog(
    'warn',
    'pipeline',
    'summary FAIL all models exhausted (non-fatal) err=%s',
    lastError?.message ?? 'Unknown error',
  );
  onNotify('error', 'Failed to create summary', lastError?.message ?? 'Unknown error');
}

export async function runPipeline(
  outlineTitle: string,
  concepts: Array<{ id: string; title: string; explanation: string }>,
  persona: Persona,
  sourceUrl?: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  sessionId?: string,
): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
  const notify = (step: PipelineStep, label: string, error?: string) => {
    onProgress?.({ step, label, error });
  };

  const topic = outlineTitle || concepts.map((c) => c.title).join(', ');

  const { updateCurrent } = useSessionStore.getState();
  const withMutex = createMutex();

  const nodes: CanvasNode[] = [];

  const persist = () =>
    withMutex(() => updateCurrent({ nodes: [...nodes], updatedAt: Date.now() }, sessionId));

  const generatedConcepts: ConceptInfo[] = [];
  const conceptLastNodeIds: (string | null)[] = [];
  const rateLimitState = createRateLimitState();

  // --- Phase 0: Concept shells ---
  pushConceptShells(nodes, concepts, sourceUrl);
  await persist();
  debugLog('log', 'pipeline', 'phase 0: %d concept shells pushed', concepts.length);

  resetIfCooled(rateLimitState);

  // --- Phase 1: Content generation (model cascade) ---
  debugLog(
    'log',
    'pipeline',
    'phase 1: generating %d concepts starting at model=%s',
    concepts.length,
    getContentModelAt(rateLimitState.contentModelIndex),
  );
  const failedConcepts = await runContentPhase(
    nodes,
    [],
    generatedConcepts,
    conceptLastNodeIds,
    concepts,
    topic,
    persona,
    signal,
    persist,
    notify,
    rateLimitState,
    sessionId,
  );

  resetIfCooled(rateLimitState);

  // Note: quizzes were generated per-concept inside runContentPhase (interleaved
  // with content) so each concept becomes answerable as soon as its content lands.

  // --- Phase 3: Summary (model cascade) ---
  debugLog(
    'log',
    'pipeline',
    'phase 3: summary start at model=%s',
    getSummaryModelAt(rateLimitState.summaryModelIndex),
  );
  await pushSummary(
    nodes,
    generatedConcepts,
    topic,
    persona,
    signal,
    persist,
    notify,
    rateLimitState,
  );

  notify(
    'done',
    failedConcepts > 0
      ? `Lesson ready with ${failedConcepts} issue${failedConcepts === 1 ? '' : 's'}`
      : 'Lesson ready!',
  );
  return { nodes, edges: [] };
}

export async function retryFailedConcept(sessionId: string, conceptId: string): Promise<boolean> {
  const session = await sessionsDb.getSession(sessionId);
  if (!session) return false;
  const sourceNode = session.nodes.find(
    (node): node is CanvasNode & { data: ConceptData } =>
      node.id === conceptId && node.data.kind === 'concept',
  );
  if (!sourceNode) return false;

  const quizIds = new Set(
    session.nodes
      .filter(
        (node) =>
          node.data.kind === 'quiz' && (node.data as QuizData).parentConceptId === conceptId,
      )
      .map((node) => node.id),
  );
  const nodes = session.nodes
    .filter((node) => !quizIds.has(node.id))
    .map((node) =>
      node.id === conceptId
        ? {
            ...node,
            data: {
              ...node.data,
              example: 'Loading...',
              generationStatus: 'generating',
              generationError: undefined,
            } as ConceptData,
          }
        : node,
    );
  const generatedConcepts: ConceptInfo[] = [];
  const { updateCurrent } = useSessionStore.getState();
  const persist = () => updateCurrent({ nodes: [...nodes], updatedAt: Date.now() }, sessionId);

  await persist();
  const success = await processOneConcept(
    nodes,
    [],
    generatedConcepts,
    {
      id: sourceNode.id,
      title: sourceNode.data.title,
      explanation: sourceNode.data.explanation,
    },
    sourceNode.data.index,
    session.name,
    session.persona,
    undefined,
    persist,
    (_step, label) => useToastStore.getState().add(label),
  );

  if (!success) return false;

  const conceptInfo = generatedConcepts[0];
  if (conceptInfo) {
    try {
      const quizzes = await executePromptTask(
        quizTask,
        {
          persona: session.persona,
          signal: undefined,
          context: { topic: session.name },
          model: getQuizModel(),
        },
        conceptInfo,
      );
      const conceptIdx = nodes.findIndex((n) => n.id === conceptId);
      quizzes.forEach((item, qi) => {
        const quizId = `${conceptId}-quiz-${qi}`;
        if (conceptIdx !== -1) {
          nodes.splice(conceptIdx + 1 + qi, 0, {
            id: quizId,
            type: 'quiz',
            data: quizItemToQuizData(item, conceptId),
          });
        } else {
          nodes.push({
            id: quizId,
            type: 'quiz',
            data: quizItemToQuizData(item, conceptId),
          });
        }
      });
      await persist();
    } catch (err) {
      debugLog(
        'warn',
        'pipeline',
        'retryFailedConcept quiz FAIL concept=%s err=%s',
        conceptId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return true;
}

export async function skipFailedConcept(sessionId: string, conceptId: string): Promise<void> {
  const session = await sessionsDb.getSession(sessionId);
  if (!session) return;
  const nodes = session.nodes.map((node) =>
    node.id === conceptId && node.data.kind === 'concept'
      ? {
          ...node,
          data: {
            ...node.data,
            example: 'Skipped. You can retry this concept later.',
            streaming: false,
            generationStatus: 'skipped',
            generationError: undefined,
          } as ConceptData,
        }
      : node,
  );
  await useSessionStore.getState().updateCurrent({ nodes, updatedAt: Date.now() }, sessionId);
}
