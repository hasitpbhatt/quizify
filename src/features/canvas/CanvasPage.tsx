import { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { CanvasNode, CanvasEdge, QuizData, ConceptData, SummaryData } from '@/shared/types';
import { ConceptNode } from './nodes/ConceptNode';
import { QuizNode } from './nodes/QuizNode';
import { SummaryNode } from './nodes/SummaryNode';
import { WigglyEdge } from './edges/WigglyEdge';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';
import { SummaryQuizInteraction } from '@/features/quiz/SummaryQuizInteraction';
import { NoteNode } from './nodes/NoteNode';
import { MobileFocusView } from './MobileFocusView';
import { useIsMobile } from '@/shared/useMediaQuery';
import type { NoteData } from '@/shared/types';
import { Plus } from 'lucide-react';
import styles from './CanvasPage.module.css';

const nodeTypes = { concept: ConceptNode, quiz: QuizNode, summary: SummaryNode, note: NoteNode };
const edgeTypes = { wiggly: WigglyEdge };

function toReactFlowNodes(canvasNodes: CanvasNode[]): Node[] {
  return canvasNodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as unknown as Record<string, unknown>,
    draggable: n.draggable,
    selected: n.selected,
  }));
}

function toReactFlowEdges(canvasEdges: CanvasEdge[]): Edge[] {
  return canvasEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type ?? 'wiggly',
  }));
}

export function CanvasPage() {
  const currentId = useSessionStore(s => s.currentId);
  const sessions = useSessionStore(s => s.sessions);
  const session = sessions.find(s => s.id === currentId);
  const [activeQuiz, setActiveQuiz] = useState<{ quizId: string; quiz: QuizData; conceptTitle: string } | null>(null);
  const [summaryQuiz, setSummaryQuiz] = useState<boolean>(false);
  const updateCurrent = useSessionStore(s => s.updateCurrent);
  const reactFlow = useReactFlow();

  const nodes: Node[] = useMemo(
    () => (session ? toReactFlowNodes(session.nodes) : []),
    [session?.nodes],
  );
  const edges: Edge[] = useMemo(
    () => (session ? toReactFlowEdges(session.edges) : []),
    [session?.edges],
  );

  const conceptTitles = useMemo(() => {
    const map = new Map<string, string>();
    if (session) {
      for (const n of session.nodes) {
        if (n.data.kind === 'concept') {
          const c = n.data as ConceptData;
          map.set(n.id, c.title);
        }
      }
    }
    return map;
  }, [session]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const canvasNode = session?.nodes.find(n => n.id === node.id);
    if (!canvasNode) return;
    if (canvasNode.data.kind === 'quiz') {
      const quiz = canvasNode.data as QuizData;
      const parentId = quiz.parentConceptId;
      const conceptTitle = conceptTitles.get(parentId) ?? 'Concept';
      setActiveQuiz({ quizId: canvasNode.id, quiz, conceptTitle });
    } else if (canvasNode.data.kind === 'summary') {
      setSummaryQuiz(true);
    }
  }, [session, conceptTitles]);

  const handleCloseQuiz = useCallback(() => {
    setActiveQuiz(null);
  }, []);

  const handleCloseSummaryQuiz = useCallback(() => {
    setSummaryQuiz(false);
  }, []);

  const handleRetakeSummary = useCallback(() => {
    setSummaryQuiz(true);
  }, []);

  const handleAddNote = useCallback(() => {
    if (!session) return;

    const viewport = reactFlow.getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

    const noteId = `note-${Date.now()}`;
    const noteNode: CanvasNode = {
      id: noteId,
      type: 'note',
      position: { x: centerX - 110, y: centerY - 50 },
      data: { kind: 'note', text: '' } as NoteData,
    };

    const updatedNodes = [...session.nodes, noteNode];
    updateCurrent({ nodes: updatedNodes });
  }, [session, reactFlow, updateCurrent]);

  const isMobile = useIsMobile();

  if (!session || nodes.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No canvas data yet. Generate an outline first.</p>
      </div>
    );
  }

  if (isMobile && session) {
    return <MobileFocusView nodes={session.nodes} />;
  }

  return (
    <div className={styles.container}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        panOnDrag
        selectionOnDrag
        panOnScroll
        nodesDraggable
        nodesConnectable={false}
        onNodeClick={handleNodeClick}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor="var(--accent)"
          maskColor="rgba(0,0,0,0.1)"
          style={{ background: 'var(--bg-elevated)' }}
        />
      </ReactFlow>

      <button
        className={styles.addNoteBtn}
        onClick={handleAddNote}
        title="Add note"
      >
        <Plus size={16} className={styles.addNoteIcon} />
        <span>Add note</span>
      </button>

      {activeQuiz && (
        <QuizInteraction
          quiz={activeQuiz.quiz}
          quizId={activeQuiz.quizId}
          conceptTitle={activeQuiz.conceptTitle}
          onClose={handleCloseQuiz}
        />
      )}

      {summaryQuiz && session && (
        <SummaryQuizInteraction
          sessionId={session.id}
          quizData={(session.nodes.find(n => n.id === '__summary__')?.data as SummaryData)?.finalQuiz ?? []}
          onClose={handleCloseSummaryQuiz}
          onRetake={handleRetakeSummary}
        />
      )}
    </div>
  );
}
