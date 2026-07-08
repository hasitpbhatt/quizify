import type { LlmProvider, Persona, CanvasNode, CanvasEdge, ConceptData, QuizData, SummaryData } from '@/shared/types';
import { executePromptTask } from '@/lib/llm/promptTask';
import { contentTask } from '@/lib/tasks/contentTask';
import { summaryTask } from '@/lib/tasks/summaryTask';
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

const CONCURRENCY = 1;

function quizItemToQuizData(item: QuizItem, conceptId: string): QuizData {
  return { kind: 'quiz', parentConceptId: conceptId, attempts: [], state: 'untested', ...item };
}

function createMutex() {
  let p: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> =>
    (p = p.then(() => fn(), () => fn())) as Promise<T>;
}

export async function runPipeline(
  outlineTitle: string,
  concepts: Array<{ id: string; title: string; explanation: string }>,
  persona: Persona,
  apiKey: string,
  provider: LlmProvider,
  sourceUrl?: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
  const notify = (step: PipelineStep, label: string, error?: string) => {
    onProgress?.({ step, label, error });
  };

  const topic = outlineTitle || concepts.map(c => c.title).join(', ');

  const COL_WIDTH = 450;
  const GAP_COL = 60;
  const GAP_ROW = 40;
  const PAIR_WIDTH = 2 * COL_WIDTH + GAP_COL;
  const START_Y = 100;

  const CHARS_PER_LINE_QUIZ = 36;
  const CHARS_PER_LINE_CONCEPT = 40;
  const LINE_HEIGHT = 21;

  const estimateQuizHeight = (prompt: string): number => {
    const fixed = 74;
    const lines = Math.max(1, Math.ceil(prompt.length / CHARS_PER_LINE_QUIZ));
    return fixed + lines * LINE_HEIGHT;
  };

  const estimateConceptHeight = (explanation: string): number => {
    const fixed = 98;
    const lines = Math.max(1, Math.ceil(explanation.length / CHARS_PER_LINE_CONCEPT));
    return fixed + lines * LINE_HEIGHT;
  };

  const allNodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const generatedConcepts: Array<{ id: string; title: string; explanation: string; example: string }> = [];
  const conceptLastNodeIds: (string | null)[] = [];
  let completedCount = 0;

  const { updateCurrent } = useSessionStore.getState();
  const withMutex = createMutex();
  const persist = () => withMutex(() =>
    updateCurrent({ nodes: [...allNodes], edges: [...edges], updatedAt: Date.now() })
  );

  // --- Phase 0: Push all concept shells immediately ---
  concepts.forEach((concept, i) => {
    const cursorX = 100 + i * PAIR_WIDTH;
    allNodes.push({
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
  await persist();

  // --- Phase 1: Generate content for all concepts in parallel ---
  notify('detail', `Generating content (0/${concepts.length} done\u2026)`);

  const processConcept = async (concept: typeof concepts[number], i: number): Promise<void> => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const cursorX = 100 + i * PAIR_WIDTH;

    try {
      const content = await executePromptTask(contentTask, {
        apiKey, provider, persona, signal,
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

      // Vertically center concept relative to its quizzes
      const n = content.quizzes.length;
      const quizHeights = content.quizzes.map(q => estimateQuizHeight(q.prompt));
      const totalColumnHeight = n > 0 ? quizHeights.reduce((a, b) => a + b + GAP_ROW, 0) - GAP_ROW : 0;
      const conceptY = n > 0 ? START_Y + Math.floor((totalColumnHeight - estimateConceptHeight(content.detail.explanation)) / 2) : START_Y;

      // Update concept shell with real data + refined position
      const nodeIndex = allNodes.findIndex(c => c.id === concept.id);
      if (nodeIndex !== -1) {
        allNodes[nodeIndex] = {
          ...allNodes[nodeIndex],
          position: { x: cursorX, y: conceptY },
          data: {
            ...allNodes[nodeIndex].data,
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
        allNodes.push({
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

      conceptLastNodeIds[i] = currentTailId;

      await persist();
      completedCount++;
      notify('detail', `Generating content (${completedCount}/${concepts.length} done\u2026)`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      console.error(`[pipeline] failed on concept ${concept.id}:`, err);
      notify('error', `Failed to load ${concept.title}`, err instanceof Error ? err.message : 'Unknown error');
      conceptLastNodeIds[i] = null;
    }
  };

  // Run concepts with bounded concurrency
  const effectiveConcurrency = Math.min(CONCURRENCY, concepts.length);

  if (effectiveConcurrency >= concepts.length) {
    await Promise.all(concepts.map((c, i) => processConcept(c, i)));
  } else {
    let next = 0;
    let abortErr: DOMException | null = null;
    const workers = Array.from({ length: effectiveConcurrency }, async () => {
      while (next < concepts.length && !abortErr) {
        const i = next++;
        try {
          await processConcept(concepts[i], i);
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

  // --- Phase 2: Connect inter-concept chain edges ---
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
  await persist();

  // --- Phase 3: Summary ---
  if (generatedConcepts.length > 0) {
    notify('summary', 'Creating summary & final quiz\u2026');
    try {
      const parsed = await executePromptTask(summaryTask, {
        apiKey, provider, persona, signal,
        context: { topic },
        onRetry: (info) => useToastStore.getState().add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`),
      }, generatedConcepts);
      const summaryData: SummaryData = {
        kind: 'summary',
        recap: parsed.recap,
        finalQuiz: parsed.finalQuiz.map(item => quizItemToQuizData(item, '__summary__')),
      };

      const lastX = 100 + concepts.length * PAIR_WIDTH;
      allNodes.push({
        id: '__summary__',
        type: 'summary',
        position: { x: lastX, y: START_Y },
        data: summaryData,
      });

      const lastChainTail = [...conceptLastNodeIds].reverse().find(id => id !== null);
      if (lastChainTail) {
        edges.push({
          id: 'edge-summary',
          source: lastChainTail,
          target: '__summary__',
          type: 'wiggly',
        });
      }

      await persist();
    } catch (err) {
      console.error('[pipeline] summary generation failed:', err);
      notify('error', 'Failed to create summary', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  notify('done', 'Canvas ready!');
  return { nodes: allNodes, edges };
}
