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

  for (let i = 0; i < concepts.length; i++) {
    const generationStatus = concepts[i].data.generationStatus;
    if (generationStatus === 'skipped') continue;
    if (generationStatus === 'failed' || generationStatus === 'generating') return i;

    const quizzes = quizzesByParent.get(concepts[i].id) ?? [];
    // A ready concept without quizzes should never block the lesson. When
    // quizzes exist, one meaningful attempt is enough to continue; incorrect
    // answers remain scheduled for review instead of trapping the learner.
    if (quizzes.length === 0) continue;
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
