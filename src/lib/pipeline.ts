import type { LlmProvider, Persona, CanvasNode, CanvasEdge, ConceptData, QuizData, SummaryData, ChatMessage } from '@/shared/types';
import { chat } from '@/lib/llm/chat';
import { buildContentSystemPrompt, buildContentUserMessage } from '@/lib/prompts/content';
import { parseContentResponse, type ContentResponse, type QuizItem } from '@/lib/llm/contentParser';
import { buildSummarySystemPrompt, buildSummaryUserMessage } from '@/lib/prompts/summary';
import { parseSummaryResponse } from '@/lib/llm/summaryParser';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useToastStore } from '@/shared/stores/toastStore';

export type PipelineStep = 'detail' | 'quiz' | 'summary' | 'build' | 'done' | 'error';

export interface PipelineProgress {
  step: PipelineStep;
  label: string;
  error?: string;
}

type ProgressCallback = (progress: PipelineProgress) => void;

function quizItemToQuizData(item: QuizItem, conceptId: string): QuizData {
  return {
    kind: 'quiz',
    parentConceptId: conceptId,
    format: item.format,
    prompt: item.prompt,
    options: item.options ?? undefined,
    blankedSentence: item.blankedSentence ?? undefined,
    items: item.items ?? undefined,
    correctAnswer: item.correctAnswer,
    acceptableAnswers: item.acceptableAnswers ?? undefined,
    rationale: item.rationale,
    attempts: [],
    state: 'untested',
  };
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

  const COL_WIDTH = 600;
  const GAP_COL = 60;
  const GAP_ROW = 40;
  const PAIR_WIDTH = 2 * COL_WIDTH + GAP_COL;
  const START_Y = 100;

  const CHARS_PER_LINE_QUIZ = 48;
  const CHARS_PER_LINE_CONCEPT = 54;
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

  let cursorX = 100;

  const allNodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const generatedConcepts: Array<{ id: string; title: string; explanation: string; example: string }> = [];
  let globalChainTailId: string | null = null;

  const { updateCurrent } = useSessionStore.getState();

  const persist = async () => {
    await updateCurrent({ nodes: [...allNodes], edges: [...edges], updatedAt: Date.now() });
  };

  for (let i = 0; i < concepts.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const concept = concepts[i];
    notify('detail', `Loading concept ${i + 1} of ${concepts.length}…`);

    try {
      // Push the concept shell immediately so the user sees it (position refined after LLM)
      const initConceptY = START_Y + 100;
      allNodes.push({
        id: concept.id,
        type: 'concept',
        position: { x: cursorX, y: initConceptY },
        data: {
          kind: 'concept',
          index: i,
          title: concept.title,
          explanation: concept.explanation,
          example: 'Loading...',
          sourceUrl,
        } satisfies ConceptData,
      });
      await persist();

      const messages: ChatMessage[] = [
        { role: 'system', content: buildContentSystemPrompt(persona, topic) },
        { role: 'user', content: buildContentUserMessage(concept) },
      ];

      let content: ContentResponse | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await chat(messages, {
          apiKey, provider, signal, responseFormat: 'json',
          onRetry: (info) => useToastStore.getState().add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`),
        });
        try {
          content = parseContentResponse(res.content);
          break;
        } catch (err) {
          if (attempt === 0) {
            console.warn(`[pipeline] ParseError for concept ${concept.id}, retrying. Raw:\n${res.content.slice(0, 500)}`);
            messages.push({ role: 'user', content: 'Your previous response could not be parsed as valid JSON. Return ONLY valid JSON matching the requested schema — no markdown fences, no extra text.' });
          } else {
            throw err;
          }
        }
      }
      if (!content) {
        throw new Error(`Failed to parse LLM response for concept ${concept.id} after retry`);
      }

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

      // Update concept position + hydrate data
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

        // Fan-out edge: concept → each quiz
        edges.push({
          id: `edge-${concept.id}-${quizId}`,
          source: concept.id,
          target: quizId,
          type: 'wiggly',
        });
        currentTailId = quizId;
        quizY += quizHeights[qi] + GAP_ROW;
      });

      cursorX += PAIR_WIDTH;

      if (i < concepts.length - 1) {
        const nextConceptId = concepts[i + 1].id;
        edges.push({
          id: `edge-${currentTailId}-${nextConceptId}`,
          source: currentTailId,
          target: nextConceptId,
          type: 'wiggly',
        });
      }
      globalChainTailId = currentTailId;

      await persist();

      if (i < concepts.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`[pipeline] failed on concept ${concept.id}:`, err);
      notify('error', `Failed to load ${concept.title}`, err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (generatedConcepts.length > 0) {
    notify('summary', 'Creating summary & final quiz…');
    try {
      const summaryMessages = [
        { role: 'system' as const, content: buildSummarySystemPrompt(persona, topic) },
        { role: 'user' as const, content: buildSummaryUserMessage(generatedConcepts) },
      ];
      const summaryRes = await chat(summaryMessages, {
        apiKey, provider, signal, responseFormat: 'json',
        onRetry: (info) => useToastStore.getState().add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`),
      });
      const parsed = parseSummaryResponse(summaryRes.content);
      const summaryData: SummaryData = {
        kind: 'summary',
        recap: parsed.recap,
        finalQuiz: parsed.finalQuiz.map(item => quizItemToQuizData(item, '__summary__')),
      };

      allNodes.push({
        id: '__summary__',
        type: 'summary',
        position: { x: cursorX, y: START_Y },
        data: summaryData,
      });

      if (globalChainTailId) {
        edges.push({
          id: 'edge-summary',
          source: globalChainTailId,
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
