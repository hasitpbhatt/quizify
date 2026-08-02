import {
  SUMMARY_NODE_ID,
  type Persona,
  type CanvasNode,
  type CanvasEdge,
  type ConceptData,
  type QuizData,
  type SummaryData,
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
        rateLimitState.contentModelIndex = modelIndex + 1;
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
): Promise<number> {
  const total = concepts.length;
  let completed = 0;
  let failed = 0;
  onNotify('detail', `Generating content (0/${total} done\u2026)`);

  await runWithConcurrency(
    concepts,
    () => 1,
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
      if (!lastNodeId) failed++;
      completed++;
      onNotify('detail', `Generating content (${completed}/${total} done\u2026)`);
    },
  );
  return failed;
}

export async function runQuizPhase(
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

  onNotify('quiz', `Generating quizzes (${generatedConcepts.length} concepts)\u2026`);

  const results = await Promise.allSettled(
    generatedConcepts.map(async (concept) => {
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
          concept,
        );
        return { conceptId: concept.id, quizzes } as const;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        debugLog(
          'warn',
          'pipeline',
          'quiz FAIL concept=%s err=%s',
          concept.id,
          err instanceof Error ? err.message : String(err),
        );
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const { conceptId, quizzes } = result.value;
      quizzes.forEach((item, qi) => {
        const quizId = `${conceptId}-quiz-${qi}`;
        const conceptIdx = nodes.findIndex((n) => n.id === conceptId);
        if (conceptIdx !== -1) {
          nodes.splice(conceptIdx + 1, 0, {
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
    }
  }

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
  );

  resetIfCooled(rateLimitState);

  // --- Phase 2: Quiz generation (small model, parallel burst) ---
  debugLog(
    'log',
    'pipeline',
    'phase 2: quiz generation for %d concepts (model=%s)',
    generatedConcepts.length,
    getQuizModel(),
  );
  await runQuizPhase(
    nodes,
    generatedConcepts,
    topic,
    persona,
    signal,
    persist,
    notify,
    rateLimitState,
  );

  resetIfCooled(rateLimitState);

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
