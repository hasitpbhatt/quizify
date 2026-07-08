import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import { getUnlockedConceptIndex, getConceptIndex } from '@/lib/progression';
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
import { Plus, BookOpen, Play, Pause, Square, Download, ChevronDown, X } from 'lucide-react';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import { exportSessionJson } from '@/lib/export/json';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { CanvasErrorFallback } from '@/lib/components/CanvasErrorFallback';
import { QuizErrorFallback } from '@/lib/components/QuizErrorFallback';
import { downloadSessionMarkdown } from '@/lib/export/markdown';
import { exportCanvasAsPng } from '@/lib/export/image';
import '@/styles/notebook.css';
import styles from './CanvasPage.module.css';

const nodeTypes = { concept: ConceptNode, quiz: QuizNode, summary: SummaryNode, note: NoteNode };
const edgeTypes = { wiggly: WigglyEdge };

function toReactFlowNodes(canvasNodes: CanvasNode[], currentConceptIndex = Infinity): Node[] {
  return canvasNodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      ...n.data,
      ...(n.data.kind === 'concept' && (n.data as ConceptData).index < currentConceptIndex
        ? { skipTyping: true }
        : {}),
    },
    draggable: n.draggable,
    selected: n.selected,
  })) as Node[];
}

function toReactFlowEdges(canvasEdges: CanvasEdge[]): Edge[] {
  return canvasEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type ?? 'wiggly',
  }));
}

function filterVisibleNodes(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  currentConceptIndex: number,
  revealedQuizIds: Set<string>,
  notebookMode: boolean,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const conceptCount = nodes.filter(n => n.data.kind === 'concept').length;
  const visibleNodeIds = new Set<string>();

  for (const n of nodes) {
    if (n.data.kind === 'note') {
      visibleNodeIds.add(n.id);
      continue;
    }
    if (n.data.kind === 'summary') {
      if (currentConceptIndex >= conceptCount) {
        visibleNodeIds.add(n.id);
      }
      continue;
    }
    if (n.data.kind === 'concept') {
      const c = n.data as ConceptData;
      if (c.index <= currentConceptIndex) {
        visibleNodeIds.add(n.id);
      }
      continue;
    }
    if (n.data.kind === 'quiz') {
      const q = n.data as QuizData;
      const parentIdx = getConceptIndex(nodes, q.parentConceptId);
      if (parentIdx < 0) continue;

      if (parentIdx < currentConceptIndex) {
        visibleNodeIds.add(n.id);
      } else if (parentIdx === currentConceptIndex) {
        if (!notebookMode || revealedQuizIds.has(n.id)) {
          visibleNodeIds.add(n.id);
        }
      }
      continue;
    }
  }

  const filteredNodes = nodes.filter(n => visibleNodeIds.has(n.id));
  const filteredEdges = edges.filter(e =>
    visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

interface CanvasPageProps {
  progress?: { stage: string; label: string };
  onHome?: () => void;
}

export function CanvasPage({ progress, onHome }: CanvasPageProps) {
  const currentId = useSessionStore(s => s.currentId);
  const sessions = useSessionStore(s => s.sessions);
  const session = sessions.find(s => s.id === currentId);
  const [activeQuiz, setActiveQuiz] = useState<{ quizId: string; quiz: QuizData; conceptTitle: string } | null>(null);
  const [summaryQuiz, setSummaryQuiz] = useState<boolean>(false);
  const [revealedQuizIds, setRevealedQuizIds] = useState<Set<string>>(new Set());
  const updateCurrent = useSessionStore(s => s.updateCurrent);
  const reactFlow = useReactFlow();
  const isMobile = useIsMobile();
  const notebookMode = useNotebookStore(s => s.notebookMode);
  const toggleNotebookMode = useNotebookStore(s => s.toggleNotebookMode);
  const ttsPlaying = useNotebookStore(s => s.ttsPlaying);
  const ttsPaused = useNotebookStore(s => s.ttsPaused);
  const segmentIndex = useNotebookStore(s => s.segmentIndex);
  const totalSegments = useNotebookStore(s => s.totalSegments);

  const focusOnActiveConcept = useCallback((conceptId: string, includeQuizzes = false) => {
    if (!session) return;
    const nodesToFocus = [conceptId];
    if (includeQuizzes) {
      const quizIds = session.nodes
        .filter(n => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === conceptId)
        .map(n => n.id);
      nodesToFocus.push(...quizIds);
    }
    
    // Smoothly pan and zoom to fit these nodes
    setTimeout(() => {
      reactFlow.fitView({
        nodes: nodesToFocus.map(id => ({ id })),
        duration: 800,
        padding: 0.25,
        minZoom: 0.7,
        maxZoom: 0.95,
      });
    }, 100); // slight delay to ensure nodes are fully layouted
  }, [session, reactFlow]);

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

  const concepts = useMemo(() => {
    return (session?.nodes ?? [])
      .filter((n): n is CanvasNode & { data: ConceptData } => n.data.kind === 'concept')
      .sort((a, b) => a.data.index - b.data.index);
  }, [session?.nodes]);

  const currentConceptIndex = useMemo(
    () => getUnlockedConceptIndex(session?.nodes ?? []),
    [session?.nodes],
  );

  const lastConceptIndexRef = useRef(currentConceptIndex);

  const visibleData = useMemo(() => {
    if (!session) return { nodes: [], edges: [] };
    return filterVisibleNodes(session.nodes, session.edges, currentConceptIndex, revealedQuizIds, notebookMode);
  }, [session, currentConceptIndex, revealedQuizIds, notebookMode]);

  const nodes: Node[] = useMemo(
    () => toReactFlowNodes(visibleData.nodes, currentConceptIndex),
    [visibleData.nodes, currentConceptIndex],
  );
  const edges: Edge[] = useMemo(
    () => toReactFlowEdges(visibleData.edges),
    [visibleData.edges],
  );

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

  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !(e.target instanceof Node && exportRef.current.contains(e.target))) {
        setShowExport(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExport]);

  const handleExportJson = useCallback(() => {
    if (!session) return;
    exportSessionJson(session);
    setShowExport(false);
  }, [session]);

  const handleExportMarkdown = useCallback(() => {
    if (!session) return;
    downloadSessionMarkdown(session);
    setShowExport(false);
  }, [session]);

  const handleExportPng = useCallback(() => {
    if (!session) return;
    exportCanvasAsPng(reactFlow, session);
    setShowExport(false);
  }, [session, reactFlow]);

  const handlePlayPause = useCallback(() => {
    if (ttsPaused) {
      ttsManager.resume();
    } else if (!ttsPlaying) {
      ttsManager.start();
    } else {
      ttsManager.pause();
    }
  }, [ttsPlaying, ttsPaused]);

  const handleStopTts = useCallback(() => {
    ttsManager.stop();
  }, []);

  // In notebook mode: subscribe to TTS onSegmentEnd for the current concept
  // to reveal its quiz nodes once the concept is done speaking
  useEffect(() => {
    if (!notebookMode || !session) return;

    const currentConcept = concepts.find(c => c.data.index === currentConceptIndex);
    if (!currentConcept) return;

    const onSegmentEnd = (nodeId: string) => {
      if (nodeId === currentConcept.id) {
        const quizIds = session.nodes
          .filter(n => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === currentConcept.id)
          .map(n => n.id);
        if (quizIds.length > 0) {
          setRevealedQuizIds(prev => {
            const next = new Set(prev);
            quizIds.forEach(id => next.add(id));
            return next;
          });
          focusOnActiveConcept(currentConcept.id, true);
        }
      }
    };

    const subId = ttsManager.subscribe(currentConcept.id, { onSegmentEnd });

    return () => {
      ttsManager.unsubscribe(subId);
    };
  }, [notebookMode, currentConceptIndex, session, concepts, focusOnActiveConcept]);

  // In notebook mode: enqueue TTS for the current concept when it becomes active
  useEffect(() => {
    if (!notebookMode || !session) return;

    const currentConcept = concepts.find(c => c.data.index === currentConceptIndex);
    if (!currentConcept) return;

    // Only reset revealed quizzes and refocus when the concept index actually changes
    if (lastConceptIndexRef.current !== currentConceptIndex) {
      setRevealedQuizIds(new Set());
      focusOnActiveConcept(currentConcept.id, false);
      lastConceptIndexRef.current = currentConceptIndex;
    }

    const text = `${currentConcept.data.title}. ${currentConcept.data.explanation}`;
    if (!ttsManager.hasSegment(currentConcept.id)) {
      ttsManager.enqueue({ nodeId: currentConcept.id, text });
    }
    if (!ttsManager.isPlaying && !ttsManager.isPaused) {
      ttsManager.start();
    }
  }, [currentConceptIndex, notebookMode, session, concepts, focusOnActiveConcept]);

  // Stop TTS narration when exiting notebook mode
  useEffect(() => {
    if (!notebookMode) {
      ttsManager.stop();
    }
  }, [notebookMode]);

  if (!session || nodes.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No canvas data yet. Generate an outline first.</p>
      </div>
    );
  }

  if (isMobile && session) {
    return <MobileFocusView nodes={visibleData.nodes} progress={progress} />;
  }

  return (
    <ErrorBoundary
      name="Canvas"
      fallback={(error: Error, reset: () => void) => (
        <CanvasErrorFallback error={error} onReset={reset} onHome={onHome ?? (() => {})} />
      )}
    >
    <div className={styles.container} data-notebook={notebookMode ? 'true' : undefined}>
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
        proOptions={{ hideAttribution: true }}
      >
        {!notebookMode && <Background variant={BackgroundVariant.Dots} gap={24} size={1} />}
        {!notebookMode && <Controls showInteractive={false} />}
        {!notebookMode && (
          <MiniMap
            nodeColor="var(--accent)"
            maskColor="rgba(0,0,0,0.1)"
            style={{ background: 'var(--bg-elevated)' }}
          />
        )}
      </ReactFlow>

      <a href="https://hasit.in" target="_blank" rel="noopener noreferrer" style={{
        position: 'absolute', bottom: 8, right: 12, zIndex: 10,
        fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
        opacity: 0.5, textDecoration: 'none',
      }}>
        hasit.in
      </a>

      {progress && progress.stage === 'detail' && (
        <div className={styles.progressBadge}>
          {progress.label}
        </div>
      )}

      <div className={styles.actionsRow} style={notebookMode ? { display: 'none' } : undefined}>
        <div className={styles.exportWrapper} ref={exportRef}>
          <button className={styles.actionBtn} onClick={() => setShowExport(v => !v)} title="Export">
            <Download size={14} />
            <span>Export</span>
            <ChevronDown size={12} />
          </button>
          {showExport && (
            <div className={styles.exportDropdown}>
              <button onClick={handleExportJson}>JSON</button>
              <button onClick={handleExportMarkdown}>Markdown</button>
              <button onClick={handleExportPng}>PNG</button>
            </div>
          )}
        </div>

        <button className={styles.actionBtn} onClick={handleAddNote} title="Add note">
          <Plus size={14} />
          <span>Add note</span>
        </button>

        <button className={styles.actionBtn} onClick={toggleNotebookMode} title="Notebook view">
          <BookOpen size={14} />
        </button>
      </div>

      {notebookMode && (
        <div className="notebookControls">
          <button onClick={toggleNotebookMode} title="Exit Notebook">
            <X size={14} />
          </button>
          <div className="notebookDivider" />
          <button onClick={handlePlayPause} title={ttsPaused ? 'Resume' : 'Play/Pause'}>
            {ttsPaused ? <Play size={14} /> : ttsPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={handleStopTts} title="Stop" disabled={!ttsPlaying && !ttsPaused}>
            <Square size={14} />
          </button>
          <span className="progressLabel">
            {totalSegments > 0
              ? `${segmentIndex + 1} / ${totalSegments}`
              : 'Queued'}
          </span>
        </div>
      )}

      {activeQuiz && (
        <ErrorBoundary name="QuizInteraction" fallback={<QuizErrorFallback onClose={handleCloseQuiz} />}>
          <QuizInteraction
            quiz={activeQuiz.quiz}
            quizId={activeQuiz.quizId}
            conceptTitle={activeQuiz.conceptTitle}
            onClose={handleCloseQuiz}
          />
        </ErrorBoundary>
      )}

      {summaryQuiz && session && (
        <ErrorBoundary name="SummaryQuiz" fallback={<QuizErrorFallback onClose={handleCloseSummaryQuiz} />}>
          <SummaryQuizInteraction
            sessionId={session.id}
            quizData={(session.nodes.find(n => n.id === '__summary__')?.data as SummaryData)?.finalQuiz ?? []}
            onClose={handleCloseSummaryQuiz}
            onRetake={handleRetakeSummary}
          />
        </ErrorBoundary>
      )}
    </div>
    </ErrorBoundary>
  );
}
