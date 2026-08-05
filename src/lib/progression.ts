import type { CanvasNode, ConceptData, QuizData } from '@/shared/types';

export function getUnlockedConceptIndex(nodes: CanvasNode[]): number {
  const concepts = nodes
    .filter((n): n is CanvasNode & { data: ConceptData } => n.data.kind === 'concept')
    .sort((a, b) => a.data.index - b.data.index);

  // Group quizzes by parent concept once (O(N)) instead of filtering per
  // concept (was O(N²)) for large canvases.
  const quizzesByParent = new Map<string, Array<CanvasNode & { data: QuizData }>>();
  for (const n of nodes) {
    if (n.data.kind === 'quiz') {
      const quiz = n as CanvasNode & { data: QuizData };
      const list = quizzesByParent.get(quiz.data.parentConceptId);
      if (list) list.push(quiz);
      else quizzesByParent.set(quiz.data.parentConceptId, [quiz]);
    }
  }

  // NOTE: this index serves double duty — progression gating AND the notebook's
  // narration target (CanvasPage reads currentConceptIndex off it). Parking here
  // is what lets narration/typing stream per-concept as content lands instead of
  // waiting for the whole lesson to finish.
  //
  // While any concept is still generating, park on the first ready concept
  // (even with zero quizzes) so its narration can start immediately. Once
  // generation completes, a ready concept without quizzes must not block
  // progression, so it is passed through.
  //
  // Failure path: a failed concept is surfaced via its recovery panel only after
  // the ready concepts before it have been passed through — it does not preempt
  // the stream of usable content ahead of it.
  const anyGenerating = concepts.some((c) => c.data.generationStatus === 'generating');

  for (let i = 0; i < concepts.length; i++) {
    const generationStatus = concepts[i].data.generationStatus;
    if (generationStatus === 'skipped') continue;
    if (generationStatus === 'failed' || generationStatus === 'generating') return i;

    const quizzes = quizzesByParent.get(concepts[i].id) ?? [];
    // A ready concept without quizzes should never block the lesson. When
    // quizzes exist, one meaningful attempt is enough to continue; incorrect
    // answers remain scheduled for review instead of trapping the learner.
    if (quizzes.length === 0) {
      if (anyGenerating) return i;
      continue;
    }
    const allAttempted = quizzes.every((q) => q.data.attempts.length > 0);
    if (!allAttempted) return i;
  }
  return concepts.length;
}

// Cache concept-id → index lookups so repeated calls per render don't each
// scan the full node list (was O(N) per call, O(N²) across a canvas).
let conceptIndexCache: { nodes: CanvasNode[]; map: Map<string, number> } | null = null;

export function getConceptIndex(nodes: CanvasNode[], conceptId: string): number {
  if (!conceptIndexCache || conceptIndexCache.nodes !== nodes) {
    const map = new Map<string, number>();
    for (const n of nodes) {
      if (n.data.kind === 'concept') {
        map.set(n.id, (n.data as ConceptData).index);
      }
    }
    conceptIndexCache = { nodes, map };
  }
  return conceptIndexCache.map.has(conceptId) ? conceptIndexCache.map.get(conceptId)! : -1;
}
