import type { CanvasNode, ConceptData, QuizData } from '@/shared/types';

export function getUnlockedConceptIndex(nodes: CanvasNode[]): number {
  const concepts = nodes
    .filter((n): n is CanvasNode & { data: ConceptData } => n.data.kind === 'concept')
    .sort((a, b) => a.data.index - b.data.index);

  for (let i = 0; i < concepts.length; i++) {
    const quizzes = nodes.filter(
      (n): n is CanvasNode & { data: QuizData } =>
        n.data.kind === 'quiz' && n.data.parentConceptId === concepts[i].id,
    );
    if (quizzes.length === 0) continue;
    const allCorrect = quizzes.every(
      q =>
        q.data.state === 'correct' ||
        q.data.state === 'mastered' ||
        (q.data.attempts && q.data.attempts.some(att => att.grade === 'correct')),
    );
    if (!allCorrect) return i;
  }
  return concepts.length;
}

export function getConceptIndex(nodes: CanvasNode[], conceptId: string): number {
  const node = nodes.find(n => n.id === conceptId);
  if (!node || node.data.kind !== 'concept') return -1;
  return (node.data as ConceptData).index;
}
