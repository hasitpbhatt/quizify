import { SUMMARY_NODE_ID, type Persona, type CanvasNode, type CanvasEdge, type ConceptData, type QuizData, type SummaryData } from '@/shared/types';
import { executePromptTask } from '@/lib/llm/promptTask';
import { contentTask } from '@/lib/tasks/contentTask';
import { summaryTask } from '@/lib/tasks/summaryTask';
import { debugLog } from '@/lib/debug';
import type { QuizItem } from '@/lib/llm/contentParser';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useToastStore } from '@/shared/stores/toastStore';

export type PipelineStep = 'detail' | 'quiz' | 'summary' | 'build' | 'done' | 'error';

export interface PipelineProgress {
  step: PipelineStep;
  label: string;
  error?: string;
}

type ProgressCallback = (progress: PipelineProgress) => void;

const CONCURRENCY = Infinity;

const COL_WIDTH = 480;
const GAP_COL = 80;
const GAP_ROW = 85;
const PAIR_WIDTH = 2 * COL_WIDTH + GAP_COL;
const START_Y = 100;
const CHARS_PER_LINE_QUIZ = 30;
const CHARS_PER_LINE_CONCEPT = 35;
const LINE_HEIGHT = 28;

export function estimateQuizHeight(prompt: string): number {
  const fixed = 130;
  const lines = Math.max(1, Math.ceil(prompt.length / CHARS_PER_LINE_QUIZ));
  return fixed + lines * LINE_HEIGHT;
}

export function estimateConceptHeight(explanation: string): number {
  const fixed = 150;
  const lines = Math.max(1, Math.ceil(explanation.length / CHARS_PER_LINE_CONCEPT));
  return fixed + lines * LINE_HEIGHT;
}

export function quizItemToQuizData(item: QuizItem, conceptId: string): QuizData {
  return { kind: 'quiz', parentConceptId: conceptId, attempts: [], state: 'untested', ...item };
}

export function createMutex() {
  let p: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> =>
    (p = p.then(() => fn(), () => fn())) as Promise<T>;
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
    const cursorX = 100 + i * PAIR_WIDTH;
    nodes.push({
      id: concept.id,
      type: 'concept',
      position: { x: cursorX, y: START_Y + 100 },
      data: {
        kind: 'concept',
        index: i,
        title: concept.title,
        explanation: concept.explanation,
        example: 'Loading...',
        sourceUrl,
      } satisfies ConceptData,
    });
  });
}

export async function processOneConcept(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  generatedConcepts: ConceptInfo[],
  concept: { id: string; title: string; explanation: string },
  index: number,
  topic: string,
  persona: Persona,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
  onNotify: (step: PipelineStep, label: string, error?: string) => void,
): Promise<string | null> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const cursorX = 100 + index * PAIR_WIDTH;

  const conceptStart = performance.now();
  debugLog('log', 'pipeline', 'concept start id=%s title=%s', concept.id, concept.title);

  try {
    const content = await executePromptTask(contentTask, {
      persona, signal,
      context: { topic },
      onRetry: (info) => useToastStore.getState().add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`),
      onParseRetry: (raw) => console.warn(`[pipeline] ParseError for concept ${concept.id}, retrying. Raw:\n${raw.slice(0, 500)}`),
    }, concept);

    generatedConcepts.push({
      id: concept.id,
      title: concept.title,
      explanation: content.detail.explanation,
      example: content.detail.example,
    });

    const n = content.quizzes.length;
    const quizHeights = content.quizzes.map(q => estimateQuizHeight(q.prompt));
    const totalColumnHeight = n > 0 ? quizHeights.reduce((a, b) => a + b + GAP_ROW, 0) - GAP_ROW : 0;
    const conceptY = n > 0 ? START_Y + Math.floor((totalColumnHeight - estimateConceptHeight(content.detail.explanation)) / 2) : START_Y;

    const nodeIndex = nodes.findIndex(c => c.id === concept.id);
    if (nodeIndex !== -1) {
      nodes[nodeIndex] = {
        ...nodes[nodeIndex],
        position: { x: cursorX, y: conceptY },
        data: {
          ...nodes[nodeIndex].data,
          explanation: content.detail.explanation,
          example: content.detail.example,
        } as ConceptData,
      };
    }

    let currentTailId = concept.id;
    let quizY = START_Y;
    content.quizzes.forEach((item, qi) => {
      const quizId = `${concept.id}-quiz-${qi}`;
      const quizData = quizItemToQuizData(item, concept.id);
      nodes.push({
        id: quizId,
        type: 'quiz',
        position: { x: cursorX + COL_WIDTH + GAP_COL, y: quizY },
        data: quizData,
      });

      edges.push({
        id: `edge-${concept.id}-${quizId}`,
        source: concept.id,
        target: quizId,
        type: 'wiggly',
      });
      currentTailId = quizId;
      quizY += quizHeights[qi] + GAP_ROW;
    });

    persist();
    const conceptElapsed = Math.round(performance.now() - conceptStart);
    debugLog('log', 'pipeline', 'concept done id=%s quizzes=%d elapsed=%dms', concept.id, content.quizzes.length, conceptElapsed);
    return currentTailId;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    debugLog('error', 'pipeline', 'concept FAIL id=%s title=%s err=%s', concept.id, concept.title, err instanceof Error ? err.message : String(err));
    onNotify('error', `Failed to load ${concept.title}`, err instanceof Error ? err.message : 'Unknown error');
    return null;
  }
}

export async function runWithConcurrency(
  items: Array<{ id: string; title: string; explanation: string }>,
  concurrency: number,
  fn: (item: { id: string; title: string; explanation: string }, index: number) => Promise<void>,
): Promise<void> {
  if (concurrency >= items.length) {
    await Promise.all(items.map((item, i) => fn(item, i)));
  } else {
    let next = 0;
    let abortErr: DOMException | null = null;
    const workers = Array.from({ length: concurrency }, async () => {
      while (next < items.length && !abortErr) {
        const i = next++;
        try {
          await fn(items[i], i);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            abortErr = err;
          } else {
            throw err;
          }
        }
      }
    });
    await Promise.all(workers);
    if (abortErr) throw abortErr;
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
): Promise<void> {
  const total = concepts.length;
  let completed = 0;
  onNotify('detail', `Generating content (0/${total} done\u2026)`);

  await runWithConcurrency(concepts, Math.min(CONCURRENCY, total), async (concept, i) => {
    const lastNodeId = await processOneConcept(
      nodes, edges, generatedConcepts, concept, i, topic,
      persona, signal, persist, onNotify,
    );
    conceptLastNodeIds[i] = lastNodeId;
    completed++;
    onNotify('detail', `Generating content (${completed}/${total} done\u2026)`);
  });
}

export function pushChainEdges(
  edges: CanvasEdge[],
  concepts: Array<{ id: string }>,
  conceptLastNodeIds: (string | null)[],
): void {
  for (let i = 0; i < concepts.length; i++) {
    const lastId = conceptLastNodeIds[i];
    if (lastId && i < concepts.length - 1) {
      const nextId = concepts[i + 1].id;
      edges.push({
        id: `edge-${lastId}-${nextId}`,
        source: lastId,
        target: nextId,
        type: 'wiggly',
      });
    }
  }
}

export async function pushSummary(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  generatedConcepts: ConceptInfo[],
  conceptLastNodeIds: (string | null)[],
  conceptsLength: number,
  topic: string,
  persona: Persona,
  signal: AbortSignal | undefined,
  persist: () => Promise<void>,
  onNotify: (step: PipelineStep, label: string, error?: string) => void,
): Promise<void> {
  if (generatedConcepts.length === 0) return;

  onNotify('summary', 'Creating summary & final quiz\u2026');
  try {
    const parsed = await executePromptTask(summaryTask, {
      persona, signal,
      context: { topic },
      onRetry: (info) => useToastStore.getState().add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`),
    }, generatedConcepts);
    const summaryData: SummaryData = {
      kind: 'summary',
      recap: parsed.recap,
      finalQuiz: parsed.finalQuiz.map(item => quizItemToQuizData(item, SUMMARY_NODE_ID)),
    };

    const lastX = 100 + conceptsLength * PAIR_WIDTH;
    nodes.push({
      id: SUMMARY_NODE_ID,
      type: 'summary',
      position: { x: lastX, y: START_Y },
      data: summaryData,
    });

    const lastChainTail = [...conceptLastNodeIds].reverse().find(id => id !== null);
    if (lastChainTail) {
      edges.push({
        id: 'edge-summary',
        source: lastChainTail,
        target: SUMMARY_NODE_ID,
        type: 'wiggly',
      });
    }

    await persist();
  } catch (err) {
    debugLog('warn', 'pipeline', 'summary FAIL (non-fatal) err=%s', err instanceof Error ? err.message : String(err));
    onNotify('error', 'Failed to create summary', err instanceof Error ? err.message : 'Unknown error');
  }
}

export async function runPipeline(
  outlineTitle: string,
  concepts: Array<{ id: string; title: string; explanation: string }>,
  persona: Persona,
  sourceUrl?: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
  const notify = (step: PipelineStep, label: string, error?: string) => {
    onProgress?.({ step, label, error });
  };

  const topic = outlineTitle || concepts.map(c => c.title).join(', ');

  const { updateCurrent } = useSessionStore.getState();
  const withMutex = createMutex();

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const persist = () => withMutex(() =>
    updateCurrent({ nodes: [...nodes], edges: [...edges], updatedAt: Date.now() })
  );

  const generatedConcepts: ConceptInfo[] = [];
  const conceptLastNodeIds: (string | null)[] = [];

  // --- Phase 0: Concept shells ---
  pushConceptShells(nodes, concepts, sourceUrl);
  await persist();
  debugLog('log', 'pipeline', 'phase 0: %d concept shells pushed', concepts.length);

  // --- Phase 1: Content generation ---
  debugLog('log', 'pipeline', 'phase 1: generating %d concepts (concurrency=%s)', concepts.length, CONCURRENCY === Infinity ? 'Infinity' : String(CONCURRENCY));
  await runContentPhase(
    nodes, edges, generatedConcepts, conceptLastNodeIds,
    concepts, topic, persona,
    signal, persist, notify,
  );

  // --- Phase 2: Inter-concept chain edges ---
  pushChainEdges(edges, concepts, conceptLastNodeIds);
  await persist();
  debugLog('log', 'pipeline', 'phase 2: %d chain edges', concepts.length - 1);

  // --- Phase 3: Summary ---
  debugLog('log', 'pipeline', 'phase 3: summary start');
  await pushSummary(
    nodes, edges, generatedConcepts, conceptLastNodeIds,
    concepts.length, topic, persona,
    signal, persist, notify,
  );

  notify('done', 'Canvas ready!');
  return { nodes, edges };
}
