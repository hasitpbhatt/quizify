import type { Persona, CanvasNode, CanvasEdge, ConceptData, QuizData, SummaryData } from '@/shared/types';
import { chat } from '@/lib/llm/chat';
import { buildDetailSystemPrompt, buildDetailUserMessage } from '@/lib/prompts/detail';
import { parseDetailExpansion, type ConceptDetail } from '@/lib/llm/detailParser';
import { buildQuizSystemPrompt, buildQuizUserMessage } from '@/lib/prompts/quiz';
import { parseQuizResponse, type ConceptQuizGroup, type QuizItem } from '@/lib/llm/quizParser';
import { buildSummarySystemPrompt, buildSummaryUserMessage } from '@/lib/prompts/summary';
import { parseSummaryResponse } from '@/lib/llm/summaryParser';
import { autoGridLayout } from '@/features/canvas/layout/autoGridLayout';
import { useSessionStore } from '@/shared/stores/sessionStore';

export type PipelineStep = 'detail' | 'quiz' | 'summary' | 'build' | 'done' | 'error';

export interface PipelineProgress {
  step: PipelineStep;
  label: string;
  error?: string;
}

type ProgressCallback = (progress: PipelineProgress) => void;

function conceptDetailToConceptData(detail: ConceptDetail, index: number, sourceUrl?: string): ConceptData {
  return {
    kind: 'concept',
    index,
    title: detail.title,
    explanation: detail.explanation,
    example: detail.example,
    sourceUrl,
  };
}

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
  sourceUrl?: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
  const notify = (step: PipelineStep, label: string, error?: string) => {
    onProgress?.({ step, label, error });
  };

  const topic = outlineTitle || concepts.map(c => c.title).join(', ');

  // Step 1: Detail expansion
  notify('detail', 'Expanding concept details…');
  let details: ConceptDetail[];
  let detailRes: import('@/lib/llm/chat').ChatResponse | undefined;
  try {
    const detailMessages = [
      { role: 'system' as const, content: buildDetailSystemPrompt(persona, topic) },
      { role: 'user' as const, content: buildDetailUserMessage(concepts) },
    ];
    detailRes = await chat(detailMessages, { apiKey, signal });
    details = parseDetailExpansion(detailRes.content, concepts.map(c => c.id));
  } catch (err) {
    console.error('[pipeline] detail expansion failed:', err, 'response:', detailRes?.content?.slice(0, 500));
    notify('error', 'Failed to expand concept details', err instanceof Error ? err.message : 'Unknown error');
    throw err;
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Step 2: Quiz generation
  notify('quiz', 'Creating quiz questions…');
  let quizGroups: ConceptQuizGroup[];
  let quizRes: import('@/lib/llm/chat').ChatResponse | undefined;
  try {
    const quizMessages = [
      { role: 'system' as const, content: buildQuizSystemPrompt(persona, topic) },
      { role: 'user' as const, content: buildQuizUserMessage(details) },
    ];
    quizRes = await chat(quizMessages, { apiKey, signal });
    quizGroups = parseQuizResponse(quizRes.content, concepts.map(c => c.id));
  } catch (err) {
    console.error('[pipeline] quiz generation failed:', err, 'response:', quizRes?.content?.slice(0, 500));
    notify('error', 'Failed to create quiz questions', err instanceof Error ? err.message : 'Unknown error');
    throw err;
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Step 3: Summary generation
  notify('summary', 'Creating summary & final quiz…');
  let summaryData: SummaryData | null = null;
  let summaryRes: import('@/lib/llm/chat').ChatResponse | undefined;
  try {
    const summaryMessages = [
      { role: 'system' as const, content: buildSummarySystemPrompt(persona, topic) },
      { role: 'user' as const, content: buildSummaryUserMessage(details) },
    ];
    summaryRes = await chat(summaryMessages, { apiKey, signal });
    const parsed = parseSummaryResponse(summaryRes.content);
    summaryData = {
      kind: 'summary',
      recap: parsed.recap,
      finalQuiz: parsed.finalQuiz.map(item => quizItemToQuizData(item, '__summary__')),
    };
  } catch (err) {
    console.error('[pipeline] summary generation failed:', err, 'response:', summaryRes?.content?.slice(0, 500));
    notify('error', 'Failed to create summary', err instanceof Error ? err.message : 'Unknown error');
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Step 4: Build nodes
  notify('build', 'Building canvas…');

  const detailMap = new Map(details.map(d => [d.id, d]));
  const quizMap = new Map(quizGroups.map(g => [g.conceptId, g.items]));

  const allNodes: CanvasNode[] = [];

  for (const concept of concepts) {
    const detail = detailMap.get(concept.id);
    if (!detail) continue;

    const quizItems = quizMap.get(concept.id) || [];
    const conceptData = conceptDetailToConceptData(detail, allNodes.length, sourceUrl);

    allNodes.push({
      id: concept.id,
      type: 'concept',
      position: { x: 0, y: 0 },
      data: conceptData,
    });

    quizItems.forEach((item, qi) => {
      const quizId = `${concept.id}-quiz-${qi}`;
      const quizData = quizItemToQuizData(item, concept.id);
      allNodes.push({
        id: quizId,
        type: 'quiz',
        position: { x: 0, y: 0 },
        data: quizData,
      });
    });
  }

  // Add summary node if generated
  if (summaryData) {
    allNodes.push({
      id: '__summary__',
      type: 'summary',
      position: { x: 0, y: 0 },
      data: summaryData,
    });
  }

  // Apply layout
  const layoutInput = allNodes.map(n => ({
    id: n.id,
    type: n.type as 'concept' | 'quiz' | 'summary',
    data: n.data,
  }));
  const layoutResult = autoGridLayout(layoutInput);

  const positionMap = new Map(layoutResult.nodes.map(n => [n.id, n.position]));
  for (const node of allNodes) {
    const pos = positionMap.get(node.id);
    if (pos) {
      node.position = pos;
    }
  }

  // Build edges: concept → its quiz nodes
  const edges: CanvasEdge[] = [];
  for (const concept of concepts) {
    const quizItems = quizMap.get(concept.id) || [];
    quizItems.forEach((_, qi) => {
      const quizId = `${concept.id}-quiz-${qi}`;
      edges.push({
        id: `edge-${concept.id}-${qi}`,
        source: concept.id,
        target: quizId,
        type: 'wiggly',
      });
    });
  }

  // Add edge from last concept to summary node
  if (summaryData && concepts.length > 0) {
    const lastConceptId = concepts[concepts.length - 1].id;
    edges.push({
      id: 'edge-summary',
      source: lastConceptId,
      target: '__summary__',
      type: 'wiggly',
    });
  }

  const { updateCurrent } = useSessionStore.getState();
  updateCurrent({ nodes: allNodes, edges, updatedAt: Date.now() });

  notify('done', 'Canvas ready!');
  return { nodes: allNodes, edges };
}
