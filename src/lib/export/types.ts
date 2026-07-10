import { SUMMARY_NODE_ID, type CanvasNode, type Session } from '@/shared/types';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sessionFilename(session: Session, ext: string): string {
  const name = session.name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  const date = new Date(session.createdAt).toISOString().slice(0, 10);
  return `${name}-${date}.${ext}`;
}

export function sortedNodes(session: Session): CanvasNode[] {
  const concepts = session.nodes.filter((n) => n.data.kind === 'concept') as CanvasNode[];
  concepts.sort((a, b) => (a.data as import('@/shared/types').ConceptData).index - (b.data as import('@/shared/types').ConceptData).index);

  const result: CanvasNode[] = [];
  const quizMap = new Map<string, CanvasNode[]>();
  const noteMap = new Map<string, CanvasNode[]>();

  for (const node of session.nodes) {
    if (node.data.kind === 'quiz') {
      const parentId = (node.data as import('@/shared/types').QuizData).parentConceptId;
      const list = quizMap.get(parentId) ?? [];
      list.push(node);
      quizMap.set(parentId, list);
    } else if (node.data.kind === 'note') {
      const linked = (node.data as import('@/shared/types').NoteData).linkedConceptId ?? '__orphan__';
      const list = noteMap.get(linked) ?? [];
      list.push(node);
      noteMap.set(linked, list);
    }
  }

  let summaryNode: CanvasNode | undefined;
  for (const node of session.nodes) {
    if (node.data.kind === 'summary') {
      summaryNode = node;
      break;
    }
  }

  for (const concept of concepts) {
    result.push(concept);
    const quizzes = (quizMap.get(concept.id) ?? []).sort((a, b) => a.position.y - b.position.y);
    result.push(...quizzes);
    const notes = noteMap.get(concept.id) ?? [];
    result.push(...notes);
  }

  if (summaryNode) {
    result.push(summaryNode);
    const summaryQuizzes = session.nodes.filter(
      (n) => n.data.kind === 'quiz' && (n.data as import('@/shared/types').QuizData).parentConceptId === SUMMARY_NODE_ID
    );
    result.push(...summaryQuizzes);
  }

  const orphanNotes = noteMap.get('__orphan__') ?? [];
  result.push(...orphanNotes);

  return result;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
