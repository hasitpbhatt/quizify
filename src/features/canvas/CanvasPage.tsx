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
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { getUnlockedConceptIndex, getConceptIndex } from '@/lib/progression';
import {
  SUMMARY_NODE_ID,
  type CanvasNode,
  type CanvasEdge,
  type QuizData,
  type NoteData,
  type ConceptData,
  type SummaryData,
} from '@/shared/types';
import { ConceptNode } from './nodes/ConceptNode';
import { QuizNode } from './nodes/QuizNode';
import { SummaryNode } from './nodes/SummaryNode';
import { WigglyEdge } from './edges/WigglyEdge';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';
import { SummaryQuizInteraction } from '@/features/quiz/SummaryQuizInteraction';
import { NoteNode } from './nodes/NoteNode';
import { MobileFocusView } from './MobileFocusView';
import { useIsMobile } from '@/shared/useMediaQuery';
import {
  Plus,
  BookOpen,
  Play,
  Pause,
  Square,
  Download,
  ChevronDown,
  X,
  Volume2,
  VolumeX,
  List,
  SkipForward,
} from 'lucide-react';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { writeNotebookModePreference } from '@/shared/notebookModePreference';
import { ttsManager } from '@/lib/llm/ttsManager';
import { exportSessionJson } from '@/lib/export/json';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { CanvasErrorFallback } from '@/lib/components/CanvasErrorFallback';
import { QuizErrorFallback } from '@/lib/components/QuizErrorFallback';
import { downloadSessionMarkdown } from '@/lib/export/markdown';
import { exportCanvasAsPng } from '@/lib/export/image';
import { useToastStore } from '@/shared/stores/toastStore';
import { useKeyboardShortcuts } from '@/shared/useKeyboardShortcuts';
import {
  getNextLearningAction,
  normalizeLearningProgress,
  type NextLearningAction,
} from '@/shared/learningProgress';
import '@/styles/notebook.css';
import styles from './CanvasPage.module.css';

const nodeTypes = { concept: ConceptNode, quiz: QuizNode, summary: SummaryNode, note: NoteNode };
const edgeTypes = { wiggly: WigglyEdge };

function toReactFlowNodes(
  canvasNodes: CanvasNode[],
  currentConceptIndex: number,
  revealedQuizIds: Set<string>,
  skipNotebookAnimation = false,
): Node[] {
  return canvasNodes.map((n) => {
    const data: Record<string, unknown> = { ...n.data };
    if (skipNotebookAnimation) {
      data.skipTyping = true;
    } else {
      if (n.data.kind === 'concept' && (n.data as ConceptData).index < currentConceptIndex) {
        data.skipTyping = true;
      }
      if (n.data.kind === 'quiz' && !revealedQuizIds.has(n.id)) {
        data.skipTyping = true;
      }
    }
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data,
      draggable: n.draggable,
      selected: n.selected,
    } as Node;
  });
}

function toReactFlowEdges(canvasEdges: CanvasEdge[]): Edge[] {
  return canvasEdges.map((e) => ({
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
  // Build concept-index lookups once (O(N)) instead of calling
  // getConceptIndex (a linear find) per quiz — was O(N²).
  const conceptIndexMap = new Map<string, number>();
  let conceptCount = 0;
  for (const n of nodes) {
    if (n.data.kind === 'concept') {
      conceptIndexMap.set(n.id, (n.data as ConceptData).index);
      conceptCount++;
    }
  }

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
      const parentIdx = conceptIndexMap.has(q.parentConceptId)
        ? conceptIndexMap.get(q.parentConceptId)!
        : getConceptIndex(nodes, q.parentConceptId);
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

  const filteredNodes = nodes.filter((n) => visibleNodeIds.has(n.id));
  const filteredEdges = edges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}

interface CanvasPageProps {
  progress?: { stage: string; label: string };
  isGenerating?: boolean;
  onHome?: () => void;
}

export function CanvasPage({ progress, isGenerating = false, onHome }: CanvasPageProps) {
  const currentId = useSessionStore((s) => s.currentId);
  const sessions = useSessionStore((s) => s.sessions);
  const session = sessions.find((s) => s.id === currentId);
  const [activeQuiz, setActiveQuiz] = useState<{
    quizId: string;
    quiz: QuizData;
    conceptTitle: string;
  } | null>(null);
  const [summaryQuiz, setSummaryQuiz] = useState<boolean>(false);
  const [revealedQuizIds, setRevealedQuizIds] = useState<Set<string>>(new Set());
  const [showOrientationCue, setShowOrientationCue] = useState(false);
  const [showLearningCue, setShowLearningCue] = useState(false);
  const [learningCueDismissed, setLearningCueDismissed] = useState(false);
  const updateCurrent = useSessionStore((s) => s.updateCurrent);
  const reactFlow = useReactFlow();
  const isMobile = useIsMobile();
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const toggleNotebookMode = useNotebookStore((s) => s.toggleNotebookMode);
  // During generation, stream content without notebook TTS gating or typewriter delays.
  const immersiveNotebook = notebookMode && !isGenerating;
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsRate = useSettingsStore((s) => s.ttsRate);
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const setTtsRate = useSettingsStore((s) => s.setTtsRate);
  const ttsPlaying = useNotebookStore((s) => s.ttsPlaying);
  const ttsPaused = useNotebookStore((s) => s.ttsPaused);
  const segmentIndex = useNotebookStore((s) => s.segmentIndex);
  const totalSegments = useNotebookStore((s) => s.totalSegments);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveFitZoomRef = useRef<number | null>(null);
  const liveFitBottomRef = useRef<number | null>(null);
  const pendingFitRafRef = useRef<number | null>(null);
  const inFlightTweenUntilRef = useRef<number>(0);
  const liveFitEnabledRef = useRef<boolean>(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useRef<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Remember the user's chosen view for each session so graph mode only comes
  // back when they explicitly selected it.
  useEffect(() => {
    if (!currentId) return;
    writeNotebookModePreference(currentId, notebookMode);
  }, [currentId, notebookMode]);

  const dismissOrientationCue = useCallback(() => {
    setShowOrientationCue(false);
    if (!currentId) return;
    try {
      sessionStorage.setItem(`quizify:nbintro:${currentId}`, 'seen');
    } catch {
      // Non-fatal if session storage is unavailable.
    }
  }, [currentId]);

  useEffect(() => {
    const idx = getUnlockedConceptIndex(session?.nodes ?? []);
    if (!notebookMode || !session || !currentId || isGenerating || idx !== 0) {
      setShowOrientationCue(false);
      return;
    }

    try {
      if (sessionStorage.getItem(`quizify:nbintro:${currentId}`) === 'seen') {
        setShowOrientationCue(false);
        return;
      }
    } catch {
      // If storage is unavailable, we still show the cue for this visit.
    }

    const timer = setTimeout(() => setShowOrientationCue(true), 450);
    return () => clearTimeout(timer);
  }, [notebookMode, session, currentId, isGenerating]);

  const dismissLearningCue = useCallback(() => {
    setShowLearningCue(false);
    setLearningCueDismissed(true);
    if (!currentId) return;
    try {
      sessionStorage.setItem(`quizify:learningcue:${currentId}`, 'dismissed');
    } catch {
      // Non-fatal if session storage is unavailable.
    }
  }, [currentId]);

  const focusOnActiveConcept = useCallback(
    (conceptId: string, includeQuizzes = false) => {
      if (!session) return;
      const nodesToFocus = [conceptId];
      if (includeQuizzes) {
        const quizIds = session.nodes
          .filter(
            (n) => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === conceptId,
          )
          .map((n) => n.id);
        nodesToFocus.push(...quizIds);
      }

      // Coalesce focus requests made while the restored node tree is mounting.
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => {
        focusTimeoutRef.current = null;
        reactFlow.fitView({
          nodes: nodesToFocus.map((id) => ({ id })),
          duration: immersiveNotebook ? 0 : 800,
          padding: 0.25,
          minZoom: immersiveNotebook ? 0.5 : 0.7,
          maxZoom: 0.95,
        });
        // Lock the zoom chosen by the initial fit; live refits use translation only.
        if (immersiveNotebook) {
          const vp = reactFlow.getViewport();
          liveFitZoomRef.current = vp.zoom;
        }
        liveFitBottomRef.current = null;
      }, 100);
    },
    [session, reactFlow, immersiveNotebook],
  );

  useEffect(
    () => () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    },
    [],
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

  const concepts = useMemo(() => {
    return (session?.nodes ?? [])
      .filter((n): n is CanvasNode & { data: ConceptData } => n.data.kind === 'concept')
      .sort((a, b) => a.data.index - b.data.index);
  }, [session?.nodes]);

  const nextAction: NextLearningAction | null = useMemo(() => {
    if (!session) return null;
    const progress = normalizeLearningProgress(
      session.lastConceptId,
      session.completedConceptIds,
      session.nextReviewAtByConceptId,
      session.lastActivityAt,
    );
    const orderedIds = concepts.map((c) => c.id);
    return getNextLearningAction(progress, orderedIds);
  }, [session, concepts]);

  const handleCueAction = useCallback(() => {
    if (!nextAction || nextAction.kind === 'complete') return;
    focusOnActiveConcept(nextAction.conceptId, true);
    setShowLearningCue(false);
  }, [nextAction, focusOnActiveConcept]);

  useEffect(() => {
    if (!notebookMode || !session || !currentId || isGenerating || !nextAction) {
      setShowLearningCue(false);
      return;
    }

    if (learningCueDismissed) {
      setShowLearningCue(false);
      return;
    }

    try {
      if (sessionStorage.getItem(`quizify:learningcue:${currentId}`) === 'dismissed') {
        setShowLearningCue(false);
        return;
      }
    } catch {
      // Fall through — show the cue.
    }

    if (showOrientationCue) {
      setShowLearningCue(false);
      return;
    }

    const timer = setTimeout(() => setShowLearningCue(true), 450);
    return () => clearTimeout(timer);
  }, [
    notebookMode,
    session,
    currentId,
    isGenerating,
    nextAction,
    learningCueDismissed,
    showOrientationCue,
  ]);

  const currentConceptIndex = useMemo(
    () => getUnlockedConceptIndex(session?.nodes ?? []),
    [session?.nodes],
  );

  const lastConceptIndexRef = useRef(currentConceptIndex);
  const orientedSessionRef = useRef<string | null>(null);

  const visibleData = useMemo(() => {
    if (!session) return { nodes: [], edges: [] };
    return filterVisibleNodes(
      session.nodes,
      session.edges,
      currentConceptIndex,
      revealedQuizIds,
      immersiveNotebook,
    );
  }, [session, currentConceptIndex, revealedQuizIds, immersiveNotebook]);

  const nodes: Node[] = useMemo(
    () => toReactFlowNodes(visibleData.nodes, currentConceptIndex, revealedQuizIds, isGenerating),
    [visibleData.nodes, currentConceptIndex, revealedQuizIds, isGenerating],
  );
  const edges: Edge[] = useMemo(() => toReactFlowEdges(visibleData.edges), [visibleData.edges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const canvasNode = session?.nodes.find((n) => n.id === node.id);
      if (!canvasNode) return;
      if (canvasNode.data.kind === 'quiz') {
        const quiz = canvasNode.data as QuizData;
        const parentId = quiz.parentConceptId;
        const conceptTitle = conceptTitles.get(parentId) ?? 'Concept';
        if (notebookMode) {
          useNotebookStore.getState().markTypingComplete(canvasNode.id);
        }
        setActiveQuiz({ quizId: canvasNode.id, quiz, conceptTitle });
      } else if (canvasNode.data.kind === 'summary') {
        setSummaryQuiz(true);
      }
    },
    [session, conceptTitles, notebookMode],
  );

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

  const [caption, setCaption] = useState<string>('');
  const [captionVisible, setCaptionVisible] = useState<boolean>(false);

  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [showOutline, setShowOutline] = useState(false);
  const outlineRef = useRef<HTMLDivElement>(null);

  // Jump to a node in notebook mode: concepts focus directly; quizzes/notes/
  // summary jump to their parent concept so the reading position follows.
  const jumpToNode = useCallback(
    (nodeId: string) => {
      if (!session) return;
      const target = session.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      if (target.data.kind === 'concept') {
        focusOnActiveConcept(nodeId, true);
      } else if (target.data.kind === 'quiz') {
        focusOnActiveConcept((target.data as QuizData).parentConceptId, true);
      } else {
        focusOnActiveConcept(
          (session.nodes.find((n) => n.data.kind === 'concept') as CanvasNode | undefined)?.id ??
            nodeId,
          true,
        );
      }
      setShowOutline(false);
    },
    [session, focusOnActiveConcept],
  );

  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (
        exportRef.current &&
        !(e.target instanceof Node && exportRef.current.contains(e.target))
      ) {
        setShowExport(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExport]);

  useEffect(() => {
    if (!showOutline) return;
    const handler = (e: MouseEvent) => {
      if (
        outlineRef.current &&
        !(e.target instanceof Node && outlineRef.current.contains(e.target))
      ) {
        setShowOutline(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOutline]);

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

  // In notebook mode: subscribe to TTS for the current concept — segment end
  // reveals its quizzes; char progress drives the boundary-based viewport refit.
  useEffect(() => {
    if (!immersiveNotebook || !session) return;

    const currentConcept = concepts.find((c) => c.data.index === currentConceptIndex);
    if (!currentConcept) return;

    const margin = 80;
    const scheduleRefit = (targetBottom: number) => {
      if (liveFitEnabledRef.current === false) return;
      if (liveFitZoomRef.current == null) return;
      if (performance.now() < inFlightTweenUntilRef.current) return;
      const vp = reactFlow.getViewport();
      const zoom = liveFitZoomRef.current;
      const targetY = window.innerHeight - margin - targetBottom * zoom;
      inFlightTweenUntilRef.current = performance.now() + 280;
      reactFlow.setViewport({ x: vp.x, y: targetY, zoom }, { duration: 250 });
    };

    const computeCurrentBottom = (): number | null => {
      let maxBottom = -Infinity;
      const trackedIds = [currentConcept.id, ...Array.from(revealedQuizIds)];
      for (const id of trackedIds) {
        const n = reactFlow.getNode(id);
        if (!n?.measured?.height) continue;
        const bottom = (n.position?.y ?? 0) + n.measured.height;
        if (bottom > maxBottom) maxBottom = bottom;
      }
      return maxBottom === -Infinity ? null : maxBottom;
    };

    const onSegmentEnd = (nodeId: string) => {
      if (nodeId === currentConcept.id) {
        const quizIds = session.nodes
          .filter(
            (n) =>
              n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === currentConcept.id,
          )
          .map((n) => n.id);
        if (quizIds.length > 0) {
          setRevealedQuizIds((prev) => {
            const next = new Set(prev);
            quizIds.forEach((id) => next.add(id));
            return next;
          });
          focusOnActiveConcept(currentConcept.id, true);
        }
      }
    };

    const onCharProgress = (_nodeId: string, _charIndex: number) => {
      // Boundary-driven, translation-only refit. Skip if the active tween
      // hasn't finished (inFlightTweenUntilRef gates new refits).
      const bottom = computeCurrentBottom();
      if (bottom == null) return;
      if (liveFitBottomRef.current === bottom) return;
      liveFitBottomRef.current = bottom;

      if (pendingFitRafRef.current != null) return;
      pendingFitRafRef.current = requestAnimationFrame(() => {
        pendingFitRafRef.current = null;
        if (liveFitZoomRef.current == null) return;
        const vp = reactFlow.getViewport();
        const viewportBottomFlow = (-vp.y + window.innerHeight) / vp.zoom;
        if (bottom > viewportBottomFlow - margin) {
          scheduleRefit(bottom);
        }
      });
    };

    const subId = ttsManager.subscribe(currentConcept.id, {
      onSegmentEnd,
      onCharProgress,
    });

    return () => {
      ttsManager.unsubscribe(subId);
      if (pendingFitRafRef.current != null) {
        cancelAnimationFrame(pendingFitRafRef.current);
        pendingFitRafRef.current = null;
      }
      liveFitZoomRef.current = null;
      liveFitBottomRef.current = null;
    };
  }, [
    immersiveNotebook,
    currentConceptIndex,
    session,
    concepts,
    revealedQuizIds,
    reactFlow,
    focusOnActiveConcept,
  ]);

  // In notebook mode: enqueue TTS for the current concept when it becomes active.
  // Gated on !prefers-reduced-motion AND the user's TTS-enabled setting:
  // auto-audio violates WCAG 2.2 and should be opt-out-able in-app.
  useEffect(() => {
    if (!immersiveNotebook || !session) return;

    const currentConcept = concepts.find((c) => c.data.index === currentConceptIndex);
    if (!currentConcept) return;
    // Wait until pipeline has filled in the concept body before narrating.
    if ((currentConcept.data as ConceptData).example === 'Loading...') return;

    const notebookStore = useNotebookStore.getState();
    if (notebookStore.hasTypingCompleted(currentConcept.id)) return;
    if (
      ttsManager.currentSegmentId === currentConcept.id ||
      ttsManager.hasSegment(currentConcept.id)
    )
      return;

    const shouldStartTts =
      lastConceptIndexRef.current !== currentConceptIndex ||
      (!ttsManager.isPlaying && !ttsManager.isPaused && !ttsManager.hasSegment(currentConcept.id));

    if (shouldStartTts) {
      setRevealedQuizIds(new Set());
      focusOnActiveConcept(currentConcept.id, false);
      lastConceptIndexRef.current = currentConceptIndex;

      ttsManager.stop();
      if (ttsEnabled && !prefersReducedMotion.current) {
        ttsManager.setRate(ttsRate);
        const text = `${currentConcept.data.title}. ${currentConcept.data.explanation}`;
        ttsManager.enqueue({ nodeId: currentConcept.id, text });
        ttsManager.start();
      }
    }
  }, [
    currentConceptIndex,
    immersiveNotebook,
    session,
    concepts,
    focusOnActiveConcept,
    ttsEnabled,
    ttsRate,
  ]);

  // Reduced-motion unlock: TTS narration is skipped under prefers-reduced-motion
  // (see effect above), and the only other code path that reveals a concept's
  // quizzes in notebook mode is the TTS onSegmentEnd callback below — which
  // never fires for reduced-motion users. That creates a deadlock: quizzes are
  // invisible -> getUnlockedConceptIndex never advances -> user is stuck.
  // This effect reveals the active concept's quizzes immediately, independent
  // of TTS, so reduced-motion users can see and answer quizzes. For non-reduced
  // -motion users this is a no-op (quizzes stay hidden until TTS narration ends,
  // preserving the intended "reveal after narration" pacing).
  useEffect(() => {
    if (!immersiveNotebook || !session || !prefersReducedMotion.current) return;
    const currentConcept = concepts.find((c) => c.data.index === currentConceptIndex);
    if (!currentConcept) return;
    const quizIds = session.nodes
      .filter(
        (n) => n.data.kind === 'quiz' && (n.data as QuizData).parentConceptId === currentConcept.id,
      )
      .map((n) => n.id);
    if (quizIds.length === 0) return;
    setRevealedQuizIds((prev) => {
      if (quizIds.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      quizIds.forEach((id) => next.add(id));
      return next;
    });
    focusOnActiveConcept(currentConcept.id, true);
  }, [immersiveNotebook, session, concepts, currentConceptIndex, focusOnActiveConcept]);

  // Stop TTS narration when exiting notebook mode or while content is still generating
  useEffect(() => {
    if (!notebookMode || isGenerating) {
      ttsManager.stop();
    }
  }, [notebookMode, isGenerating]);

  // Sync ttsManager state → notebookStore so buttons reflect real TTS state
  useEffect(() => {
    const unsub = ttsManager.subscribeState((state) => {
      useNotebookStore.getState().syncTtsState(state);
    });
    return unsub;
  }, []);

  // Caption bar: surface the currently-narrated text as an always-visible
  // caption so deaf / hard-of-hearing users (and anyone who scrolled the node
  // out of view) get a text alternative to the default audio narration.
  // Driven by ttsManager segment callbacks; cleared when narration stops.
  useEffect(() => {
    if (!notebookMode) {
      setCaptionVisible(false);
      setCaption('');
      return;
    }

    const subId = ttsManager.subscribe('__caption__', {
      onSegmentStart: () => {
        // text arrives via onCharProgress; show the bar immediately.
        setCaptionVisible(true);
      },
      onCharProgress: (_nodeId, _charIndex, text?: string) => {
        if (text != null) {
          setCaption(text);
          setCaptionVisible(true);
        }
      },
      onSegmentEnd: (_nodeId) => {
        setCaptionVisible(false);
      },
    });

    return () => {
      ttsManager.unsubscribe(subId);
      setCaptionVisible(false);
    };
  }, [notebookMode]);

  // Hide the caption when narration is fully stopped/idle (no active segment).
  useEffect(() => {
    if (!ttsPlaying && !ttsPaused) {
      setCaptionVisible(false);
    }
  }, [ttsPlaying, ttsPaused]);

  // Kill switch for the live char-progress viewport refit.
  // Disable via either:
  //   URL:   append ?nbFit=0 to the page URL
  //   Store: localStorage.setItem('nbFit', '0') from devtools
  useEffect(() => {
    const readFlag = () => {
      const url = new URLSearchParams(window.location.search);
      const fromUrl = url.get('nbFit');
      const fromLs = localStorage.getItem('nbFit');
      liveFitEnabledRef.current = !(fromUrl === '0' || fromLs === '0');
    };
    readFlag();
    window.addEventListener('storage', readFlag);
    return () => {
      window.removeEventListener('storage', readFlag);
    };
  }, []);

  // On TTS stop transition (playing|paused -> idle|stopped), drop the
  // locked zoom so a final fit can re-zoom to include any newly-revealed
  // quizzes. Without this, stale zoom leaves a half-fit viewport.
  useEffect(() => {
    let prev: string | null = null;
    const unsub = ttsManager.subscribeState((state) => {
      const fireFinalFit = prev === 'playing' && (state === 'idle' || state === 'stopped');
      prev = state;
      if (!fireFinalFit || !immersiveNotebook || !session) return;
      const active = concepts.find((c) => c.data.index === currentConceptIndex);
      if (!active) return;
      liveFitZoomRef.current = null;
      liveFitEnabledRef.current = useNotebookStore.getState().notebookMode
        ? !(
            new URLSearchParams(window.location.search).get('nbFit') === '0' ||
            localStorage.getItem('nbFit') === '0'
          )
        : true;
      focusOnActiveConcept(active.id, true);
    });
    return unsub;
  }, [immersiveNotebook, session, concepts, currentConceptIndex, focusOnActiveConcept]);

  // Window resize invalidates the locked zoom and last-known bottom so the
  // next char-progress event recomputes translation for the new viewport.
  useEffect(() => {
    if (!immersiveNotebook) return;
    const onResize = () => {
      liveFitZoomRef.current = null;
      liveFitBottomRef.current = null;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [immersiveNotebook]);

  // Keyboard navigation in notebook mode: arrows + PageUp/PageDown + Space
  // translate the viewport by fixed steps. Gated on no modal open.
  useEffect(() => {
    if (!immersiveNotebook) return;
    const handler = (e: KeyboardEvent) => {
      if (activeQuiz || summaryQuiz) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const vp = reactFlow.getViewport();
      const STEP = 60;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case 'ArrowUp':
          dy = STEP;
          break;
        case 'ArrowDown':
          dy = -STEP;
          break;
        case 'ArrowLeft':
          dx = STEP;
          break;
        case 'ArrowRight':
          dx = -STEP;
          break;
        case 'PageDown':
          dy = -window.innerHeight * 0.5;
          break;
        case 'PageUp':
          dy = window.innerHeight * 0.5;
          break;
        case ' ':
          if (e.shiftKey) dy = window.innerHeight * 0.5;
          else dy = -window.innerHeight * 0.5;
          break;
        default:
          return;
      }
      e.preventDefault();
      reactFlow.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom }, { duration: 150 });
    };
    const container = containerRef.current;
    container?.addEventListener('keydown', handler);
    return () => container?.removeEventListener('keydown', handler);
  }, [immersiveNotebook, activeQuiz, summaryQuiz, reactFlow]);

  // Persist + restore notebook reading position per session so a mid-notebook
  // reload resumes at the same concept, viewport, and revealed quizzes instead
  // of dropping the user back to concept 0.
  const nbPosKey = currentId ? `quizify:nbpos:${currentId}` : null;

  // Focus the first concept once when restoring a session. If a saved reading
  // position exists, restore it (viewport + revealed quizzes) instead of
  // snapping to concept 0. The narration effect may request the same focus, so
  // both paths intentionally use the same fit.
  useEffect(() => {
    if (!immersiveNotebook || !session || orientedSessionRef.current === session.id) return;

    orientedSessionRef.current = session.id;

    let restored = false;
    if (nbPosKey) {
      try {
        const raw = localStorage.getItem(nbPosKey);
        if (raw) {
          const pos = JSON.parse(raw) as {
            conceptIndex?: number;
            viewport?: { x: number; y: number; zoom: number };
            revealedQuizIds?: string[];
          };
          if (
            pos.revealedQuizIds &&
            Array.isArray(pos.revealedQuizIds) &&
            pos.revealedQuizIds.length > 0
          ) {
            setRevealedQuizIds(new Set(pos.revealedQuizIds));
          }
          const target = concepts.find((c) => c.data.index === (pos.conceptIndex ?? 0));
          if (target) {
            // Defer viewport apply until after the initial mount/fit settles.
            if (pos.viewport) {
              requestAnimationFrame(() => reactFlow.setViewport(pos.viewport!, { duration: 0 }));
            }
            focusOnActiveConcept(target.id, pos.revealedQuizIds?.length ? true : false);
            restored = true;
          }
        }
      } catch {
        /* corrupt payload — fall through to default orientation */
      }
    }

    if (!restored) {
      const firstConcept = concepts.find((c) => c.data.index === 0);
      if (firstConcept) focusOnActiveConcept(firstConcept.id);
    }
  }, [immersiveNotebook, session, concepts, focusOnActiveConcept, nbPosKey, reactFlow]);

  // Debounced save of the reading position whenever it changes.
  useEffect(() => {
    if (!immersiveNotebook || !nbPosKey) return;
    const handle = setTimeout(() => {
      try {
        const payload = {
          conceptIndex: currentConceptIndex,
          viewport: reactFlow.getViewport(),
          revealedQuizIds: Array.from(revealedQuizIds),
        };
        localStorage.setItem(nbPosKey, JSON.stringify(payload));
      } catch {
        /* storage unavailable — non-fatal */
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [immersiveNotebook, nbPosKey, currentConceptIndex, revealedQuizIds, reactFlow]);

  // Migration: sessionStorage summary quiz results → Session.scores (IndexedDB)
  const scoreMigratedRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (scoreMigratedRef.current) return;
    if (Object.keys(session.scores).length > 0) {
      scoreMigratedRef.current = true;
      return;
    }

    const saved = sessionStorage.getItem(`summary-quiz-${session.id}`);
    if (!saved) {
      scoreMigratedRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(saved) as boolean[];
      const scores: Record<string, { best: number; attempts: number }> = {};
      parsed.forEach((correct, i) => {
        scores[String(i)] = { best: correct ? 1 : 0, attempts: 1 };
      });
      sessionStorage.removeItem(`summary-quiz-${session.id}`);
      updateCurrent({ scores });
      scoreMigratedRef.current = true;
    } catch {
      scoreMigratedRef.current = true;
    }
  }, [session, updateCurrent]);

  const handleUpdateScores = useCallback(
    (scores: Record<string, { best: number; attempts: number }>) => {
      if (!session) return;
      updateCurrent({ scores });
    },
    [session, updateCurrent],
  );

  const handleKbEscape = useCallback(() => {
    if (activeQuiz) setActiveQuiz(null);
    else if (summaryQuiz) setSummaryQuiz(false);
    else if (notebookMode) toggleNotebookMode();
  }, [activeQuiz, summaryQuiz, notebookMode, toggleNotebookMode]);

  const handleKbHelp = useCallback(() => {
    useToastStore
      .getState()
      .add('Shortcuts: N = Add note · ? = Show this · Esc = Close quiz / exit Notebook');
  }, []);

  // Global keyboard shortcuts: N = add note, ? = help, Escape = close quiz
  useKeyboardShortcuts({
    enabled: !isMobile,
    onAddNote: handleAddNote,
    onEscape: handleKbEscape,
    onShowHelp: handleKbHelp,
  });

  if (!session || (nodes.length === 0 && !isGenerating)) {
    return (
      <div className={styles.empty}>
        <p>No canvas data yet. Generate an outline first.</p>
      </div>
    );
  }

  if (nodes.length === 0 && isGenerating) {
    return (
      <div className={styles.buildingState}>
        <div className={styles.buildingOrb} aria-hidden />
        <p className={styles.buildingLabel}>Building your canvas</p>
        {progress?.label && <p>{progress.label}</p>}
      </div>
    );
  }

  const showProgress = isGenerating && progress && progress.stage !== 'done';

  if (isMobile && session) {
    return (
      <MobileFocusView nodes={visibleData.nodes} progress={progress} isGenerating={isGenerating} />
    );
  }

  return (
    <ErrorBoundary
      name="Canvas"
      fallback={(error: Error, reset: () => void) => (
        <CanvasErrorFallback error={error} onReset={reset} onHome={onHome ?? (() => {})} />
      )}
    >
      <div
        ref={containerRef}
        className={styles.container}
        data-notebook={notebookMode ? 'true' : undefined}
        data-generating={isGenerating ? 'true' : undefined}
        tabIndex={immersiveNotebook ? 0 : undefined}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={!immersiveNotebook}
          minZoom={0.3}
          maxZoom={2}
          panOnDrag={immersiveNotebook ? [1, 2] : true}
          selectionOnDrag={!immersiveNotebook}
          panOnScroll={true}
          nodesConnectable={false}
          nodesDraggable={!immersiveNotebook}
          onNodeClick={handleNodeClick}
          proOptions={{ hideAttribution: true }}
        >
          {!notebookMode && (
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.5}
              color="var(--border-strong)"
              style={{ opacity: 0.6 }}
            />
          )}
          {!notebookMode && <Controls showInteractive={false} />}
          {!notebookMode && (
            <MiniMap
              nodeColor="var(--accent)"
              maskColor="rgba(0,0,0,0.1)"
              style={{ background: 'var(--bg-elevated)', pointerEvents: 'none' }}
            />
          )}
        </ReactFlow>

        <a
          href="https://hasit.in"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            zIndex: 10,
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            opacity: 0.5,
            textDecoration: 'none',
          }}
        >
          hasit.in
        </a>

        {showProgress && (
          <div className={styles.progressBadge}>
            <span className={styles.progressDot} aria-hidden />
            {progress.label}
          </div>
        )}

        {!notebookMode && (
          <div className={styles.actionsRow}>
            <>
              <div className={styles.exportWrapper} ref={exportRef}>
                <button
                  className={styles.actionBtn}
                  onClick={() => setShowExport((v) => !v)}
                  title="Export"
                >
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

              <button
                className={styles.actionBtn}
                onClick={toggleNotebookMode}
                title="Notebook view"
              >
                <BookOpen size={14} />
              </button>
            </>
          </div>
        )}

        {notebookMode && captionVisible && caption && (
          <div className="notebookCaption" role="status" aria-live="polite">
            {caption}
          </div>
        )}

        {notebookMode && showOrientationCue && (
          <div className="notebookOrientation" role="status" aria-live="polite">
            <div className="notebookOrientationCopy">
              <span className="notebookOrientationLabel">Start here</span>
              <span className="notebookOrientationText">
                This lesson is centered on the current concept. Let the narration guide you, then
                open the quiz when you’re ready.
              </span>
            </div>
            <button
              className="notebookOrientationClose"
              onClick={dismissOrientationCue}
              type="button"
            >
              Got it
            </button>
          </div>
        )}

        {notebookMode && showLearningCue && nextAction && (
          <div className="notebookLearningCue" role="status" aria-live="polite">
            <div className="notebookLearningCueCopy">
              <span className="notebookLearningCueText">
                {nextAction.kind === 'review'
                  ? 'A quick review is ready'
                  : nextAction.kind === 'continue'
                    ? `Continue with ${conceptTitles.get(nextAction.conceptId) ?? 'the current concept'}`
                    : nextAction.kind === 'start'
                      ? `Begin with ${conceptTitles.get(nextAction.conceptId) ?? 'the first concept'}`
                      : 'You have covered this lesson'}
              </span>
            </div>
            {nextAction.kind !== 'complete' && (
              <button className="notebookLearningCueAction" onClick={handleCueAction} type="button">
                {nextAction.kind === 'review'
                  ? 'Review now'
                  : nextAction.kind === 'continue'
                    ? 'Continue'
                    : 'Start lesson'}
              </button>
            )}
            <button
              className="notebookLearningCueClose"
              onClick={dismissLearningCue}
              type="button"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {notebookMode && (
          <>
            <div
              className="notebookModePill"
              title="You're in Notebook view. Press Esc or the X to switch to the canvas graph."
            >
              <BookOpen size={12} />
              <span>Notebook</span>
            </div>
            {concepts.length > 0 && (
              <div className="notebookConceptProgress">
                Concept {currentConceptIndex + 1} of {concepts.length}
              </div>
            )}
            <div className="notebookControls">
              <button onClick={toggleNotebookMode} title="Exit Notebook">
                <X size={14} />
              </button>
              <div className="notebookDivider" />
              <button onClick={() => setShowOutline((v) => !v)} title="Table of contents">
                <List size={14} />
              </button>
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                title={ttsEnabled ? 'Mute narration' : 'Unmute narration'}
                aria-pressed={!ttsEnabled}
              >
                {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button
                onClick={() => ttsManager.skip()}
                title="Skip segment"
                disabled={!ttsPlaying && !ttsPaused}
              >
                <SkipForward size={14} />
              </button>
              <button onClick={handlePlayPause} title={ttsPaused ? 'Resume' : 'Play/Pause'}>
                {ttsPaused ? (
                  <Play size={14} />
                ) : ttsPlaying ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
              <button onClick={handleStopTts} title="Stop" disabled={!ttsPlaying && !ttsPaused}>
                <Square size={14} />
              </button>
              <span className="notebookDivider" />
              <select
                className="notebookRate"
                value={ttsRate}
                onChange={(e) => setTtsRate(Number(e.target.value))}
                title="Narration speed"
                aria-label="Narration speed"
              >
                <option value={0.75}>0.75×</option>
                <option value={1}>1×</option>
                <option value={1.25}>1.25×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2×</option>
              </select>
              <span
                className="progressLabel"
                title={
                  ttsManager.speechSynthesisAvailable
                    ? undefined
                    : 'Voice narration unavailable in this browser — showing text'
                }
              >
                {ttsManager.speechSynthesisAvailable
                  ? totalSegments > 0
                    ? `${segmentIndex + 1} / ${totalSegments}`
                    : 'Queued'
                  : totalSegments > 0
                    ? `Reading ${segmentIndex + 1} / ${totalSegments}`
                    : 'Reading'}
              </span>
            </div>
          </>
        )}

        {notebookMode && showOutline && session && (
          <div
            className="notebookOutlineOverlay"
            onClick={() => setShowOutline(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
          >
            <div
              className="notebookOutlinePanel"
              ref={outlineRef}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="notebookOutlineHeader">
                <span className="notebookOutlineTitle">Contents</span>
                <button
                  className="notebookOutlineClose"
                  onClick={() => setShowOutline(false)}
                  aria-label="Close contents"
                >
                  ✕
                </button>
              </div>
              <div className="notebookOutlineList">
                {visibleData.nodes.map((n) => {
                  const kind = n.data.kind;
                  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);
                  const title =
                    kind === 'concept'
                      ? (n.data as ConceptData).title
                      : kind === 'summary'
                        ? `${(n.data as SummaryData).recap.length} recap points`
                        : kind === 'quiz'
                          ? (n.data as QuizData).prompt
                          : (n.data as NoteData).text.slice(0, 40);
                  return (
                    <button
                      key={n.id}
                      className="notebookOutlineItem"
                      onClick={() => jumpToNode(n.id)}
                    >
                      <span className="notebookOutlineKind">{kindLabel}</span>
                      <span className="notebookOutlineItemTitle">{title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeQuiz && (
          <ErrorBoundary
            name="QuizInteraction"
            fallback={<QuizErrorFallback onClose={handleCloseQuiz} />}
          >
            <QuizInteraction
              quiz={activeQuiz.quiz}
              quizId={activeQuiz.quizId}
              conceptTitle={activeQuiz.conceptTitle}
              onClose={handleCloseQuiz}
            />
          </ErrorBoundary>
        )}

        {summaryQuiz && session && (
          <ErrorBoundary
            name="SummaryQuiz"
            fallback={<QuizErrorFallback onClose={handleCloseSummaryQuiz} />}
          >
            <SummaryQuizInteraction
              quizData={
                (session.nodes.find((n) => n.id === SUMMARY_NODE_ID)?.data as SummaryData)
                  ?.finalQuiz ?? []
              }
              onClose={handleCloseSummaryQuiz}
              onRetake={handleRetakeSummary}
              initialScores={session.scores}
              onUpdateScores={handleUpdateScores}
            />
          </ErrorBoundary>
        )}
      </div>
    </ErrorBoundary>
  );
}
