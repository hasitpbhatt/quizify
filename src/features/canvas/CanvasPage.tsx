import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { getUnlockedConceptIndex, getConceptIndex } from '@/lib/progression';
import {
  SUMMARY_NODE_ID,
  type CanvasNode,
  type QuizData,
  type NoteData,
  type ConceptData,
  type SummaryData,
  type ImageData,
} from '@/shared/types';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';
import { SummaryQuizInteraction } from '@/features/quiz/SummaryQuizInteraction';
import { NoteNode } from './nodes/NoteNode';
import { ImageNode } from './nodes/ImageNode';
import { MobileFocusView } from './MobileFocusView';
import { useIsMobile, useMediaQuery } from '@/shared/useMediaQuery';
import { useDismissibleCue } from '@/shared/useDismissibleCue';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  List,
  SkipForward,
  RefreshCw,
  AlertTriangle,
  CircleHelp,
  Monitor,
  Moon,
  Plus,
  Sun,
  Download,
} from 'lucide-react';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { CanvasErrorFallback } from '@/lib/components/CanvasErrorFallback';
import { QuizErrorFallback } from '@/lib/components/QuizErrorFallback';
import { AccessibleDialog } from '@/lib/components/AccessibleDialog';
import { ConceptNode } from './nodes/ConceptNode';
import { QuizNode } from './nodes/QuizNode';
import { SummaryNode } from './nodes/SummaryNode';
import { useKeyboardShortcuts } from '@/shared/useKeyboardShortcuts';
import { useToastStore } from '@/shared/stores/toastStore';
import { retryFailedConcept, skipFailedConcept } from '@/lib/pipeline';
import { exportSessionJson } from '@/lib/export/json';
import { downloadSessionMarkdown } from '@/lib/export/markdown';
import {
  getNextLearningAction,
  normalizeLearningProgress,
  type NextLearningAction,
} from '@/shared/learningProgress';
import '@/styles/notebook.css';
import styles from './CanvasPage.module.css';

function filterVisibleNodes(nodes: CanvasNode[], currentConceptIndex: number): CanvasNode[] {
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

      if (parentIdx <= currentConceptIndex) {
        visibleNodeIds.add(n.id);
      }
      continue;
    }
    if (n.data.kind === 'image') {
      const img = n.data as ImageData;
      const parentIdx = conceptIndexMap.has(img.parentConceptId)
        ? conceptIndexMap.get(img.parentConceptId)!
        : getConceptIndex(nodes, img.parentConceptId);
      if (parentIdx < 0) continue;

      if (parentIdx <= currentConceptIndex) {
        visibleNodeIds.add(n.id);
      }
      continue;
    }
  }

  return nodes.filter((n) => visibleNodeIds.has(n.id));
}

interface CanvasPageProps {
  progress?: { stage: string; label: string };
  isGenerating?: boolean;
  onHome?: () => void;
}

export function CanvasPage({ progress, isGenerating = false, onHome }: CanvasPageProps) {
  const currentId = useSessionStore((s) => s.currentId);
  const session = useSessionStore((s) => {
    const id = s.currentId;
    return id ? (s.sessions.find((ss) => ss.id === id) ?? null) : null;
  });
  const [activeQuiz, setActiveQuiz] = useState<{
    quizId: string;
    quiz: QuizData;
    conceptTitle: string;
  } | null>(null);
  const [summaryQuiz, setSummaryQuiz] = useState<boolean>(false);
  const [revealedQuizIds, setRevealedQuizIds] = useState<Set<string>>(new Set());
  const [learningCueDismissed, setLearningCueDismissed] = useState(false);
  const [retryingConceptIds, setRetryingConceptIds] = useState<Set<string>>(new Set());
  const updateCurrent = useSessionStore((s) => s.updateCurrent);
  const isMobile = useIsMobile();
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const immersiveNotebook = notebookMode;
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsRate = useSettingsStore((s) => s.ttsRate);
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const setTtsRate = useSettingsStore((s) => s.setTtsRate);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const ttsPlaying = useNotebookStore((s) => s.ttsPlaying);
  const ttsPaused = useNotebookStore((s) => s.ttsPaused);
  const segmentIndex = useNotebookStore((s) => s.segmentIndex);
  const totalSegments = useNotebookStore((s) => s.totalSegments);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, [currentId, isGenerating]);

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

  const currentIdx = getUnlockedConceptIndex(session?.nodes ?? []);

  const { show: showOrientationCue, dismiss: dismissOrientationCue } = useDismissibleCue({
    storageKey: currentId ? `quizify:nbintro:${currentId}` : '',
    delay: 450,
    enabled: !!notebookMode && !!session && !!currentId && !isGenerating && currentIdx === 0,
  });

  const { show: showLearningCue, dismiss: dismissLearningCue } = useDismissibleCue({
    storageKey: currentId ? `quizify:learningcue:${currentId}` : '',
    delay: 450,
    enabled:
      !!notebookMode &&
      !!session &&
      !!currentId &&
      !isGenerating &&
      !!nextAction &&
      !learningCueDismissed &&
      !showOrientationCue,
  });

  const dismissLearningCueLocal = useCallback(() => {
    setLearningCueDismissed(true);
    dismissLearningCue();
  }, [dismissLearningCue]);

  const focusOnActiveConcept = useCallback((conceptId: string, _includeQuizzes?: boolean) => {
    const el = containerRef.current?.querySelector(`[data-concept-id="${conceptId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const handleCueAction = useCallback(() => {
    if (!nextAction || nextAction.kind === 'complete') return;
    focusOnActiveConcept(nextAction.conceptId, true);
    dismissLearningCueLocal();
  }, [nextAction, focusOnActiveConcept, dismissLearningCueLocal]);

  const currentConceptIndex = useMemo(
    () => getUnlockedConceptIndex(session?.nodes ?? []),
    [session?.nodes],
  );
  const currentConcept = useMemo(
    () => concepts.find((concept) => concept.data.index === currentConceptIndex),
    [concepts, currentConceptIndex],
  );
  const currentQuizIds = useMemo(() => {
    if (!session || !currentConcept) return [];
    return session.nodes
      .filter(
        (node) =>
          node.data.kind === 'quiz' &&
          (node.data as QuizData).parentConceptId === currentConcept.id,
      )
      .map((node) => node.id);
  }, [session, currentConcept]);

  const revealCurrentQuizzes = useCallback(() => {
    if (currentQuizIds.length === 0) return;
    setRevealedQuizIds((previous) => {
      if (currentQuizIds.every((id) => previous.has(id))) return previous;
      const next = new Set(previous);
      currentQuizIds.forEach((id) => next.add(id));
      return next;
    });
    if (currentConcept) focusOnActiveConcept(currentConcept.id, true);
  }, [currentQuizIds, currentConcept, focusOnActiveConcept]);

  // Audio is an enhancement, never a progression dependency.
  useEffect(() => {
    if (immersiveNotebook && !ttsEnabled) revealCurrentQuizzes();
  }, [immersiveNotebook, ttsEnabled, revealCurrentQuizzes]);

  const completedTypingNodeIds = useNotebookStore((s) => s.completedTypingNodeIds);

  // Typing completion must unlock quizzes even when TTS is muted or unavailable.
  useEffect(() => {
    if (!immersiveNotebook || !currentConcept) return;
    if (!completedTypingNodeIds[currentConcept.id]) return;
    revealCurrentQuizzes();
  }, [immersiveNotebook, currentConcept, completedTypingNodeIds, revealCurrentQuizzes]);

  const lastConceptIndexRef = useRef(currentConceptIndex);
  const orientedSessionRef = useRef<string | null>(null);

  const visibleNodes = useMemo(() => {
    if (!session) return [];
    return filterVisibleNodes(session.nodes, currentConceptIndex);
  }, [session, currentConceptIndex]);

  const { orderedVisibleNodes, looseNotes } = useMemo(() => {
    const baseNodes = visibleNodes.filter((node) => node.data.kind !== 'note');
    const visibleConceptIds = new Set(
      baseNodes.filter((node) => node.data.kind === 'concept').map((node) => node.id),
    );
    const notesByConcept = new Map<string, CanvasNode[]>();
    const loose: CanvasNode[] = [];

    for (const node of visibleNodes) {
      if (node.data.kind !== 'note') continue;
      const parentId = (node.data as NoteData).linkedConceptId;
      if (!parentId || !visibleConceptIds.has(parentId)) {
        loose.push(node);
        continue;
      }
      const notes = notesByConcept.get(parentId) ?? [];
      notes.push(node);
      notesByConcept.set(parentId, notes);
    }

    const ordered: CanvasNode[] = [];
    baseNodes.forEach((node, index) => {
      ordered.push(node);
      if (node.data.kind === 'concept') {
        const hasQuiz = baseNodes.some(
          (candidate) =>
            candidate.data.kind === 'quiz' &&
            (candidate.data as QuizData).parentConceptId === node.id,
        );
        if (!hasQuiz) ordered.push(...(notesByConcept.get(node.id) ?? []));
        return;
      }
      if (node.data.kind !== 'quiz') return;
      const parentId = (node.data as QuizData).parentConceptId;
      const hasLaterQuiz = baseNodes
        .slice(index + 1)
        .some(
          (later) =>
            later.data.kind === 'quiz' && (later.data as QuizData).parentConceptId === parentId,
        );
      if (!hasLaterQuiz) ordered.push(...(notesByConcept.get(parentId) ?? []));
    });

    for (const [parentId, notes] of notesByConcept) {
      if (!baseNodes.some((node) => node.id === parentId && node.data.kind === 'concept')) {
        loose.push(...notes);
      }
    }

    return { orderedVisibleNodes: ordered, looseNotes: loose };
  }, [visibleNodes]);

  const conceptGroups = useMemo(() => {
    const groups: CanvasNode[][] = [];
    for (const node of orderedVisibleNodes) {
      if (node.data.kind === 'concept') {
        groups.push([node]);
      } else if (groups.length > 0) {
        groups[groups.length - 1].push(node);
      } else {
        groups.push([node]);
      }
    }
    return groups;
  }, [orderedVisibleNodes]);

  const handleNodeClick = useCallback(
    (canvasNode: CanvasNode) => {
      if (canvasNode.data.kind === 'quiz') {
        const quiz = canvasNode.data as QuizData;
        const parentId = quiz.parentConceptId;
        const conceptTitle = conceptTitles.get(parentId) ?? 'Concept';
        useNotebookStore.getState().markTypingComplete(canvasNode.id);
        setActiveQuiz({ quizId: canvasNode.id, quiz, conceptTitle });
      } else if (canvasNode.data.kind === 'summary') {
        setSummaryQuiz(true);
      } else if (canvasNode.data.kind === 'concept') {
        if (notebookMode && canvasNode.data.index > currentConceptIndex) {
          useToastStore.getState().add('Complete the current concept to unlock this lesson.');
          return;
        }
        focusOnActiveConcept(canvasNode.id, true);
      }
    },
    [conceptTitles, currentConceptIndex, focusOnActiveConcept, notebookMode],
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

    // Pin the write target AND take the node snapshot from the same getState()
    // read: `currentId` can change between render and this callback (Home ->
    // Generate), and the closed-over `session` is a stale render snapshot under
    // key-repeat on "N" (several keydowns land before React re-renders).
    const { currentId: sessionId, sessions } = useSessionStore.getState();
    const liveSession = sessionId ? sessions.find((s) => s.id === sessionId) : undefined;
    if (!sessionId || !liveSession) return;

    // `note-${Date.now()}` collides for two notes in the same millisecond,
    // duplicating both the node id and the React key. crypto.randomUUID is
    // available in all secure contexts (localhost / https).
    const uid = crypto.randomUUID();
    const noteId = `note-${uid}`;
    const linkedConceptId = currentConcept?.id;
    const noteNode: CanvasNode = {
      id: noteId,
      type: 'note',
      data: { kind: 'note', text: '', linkedConceptId } as NoteData,
    };

    let insertionIndex = liveSession.nodes.length;
    if (linkedConceptId) {
      const parentAndQuizIndexes = liveSession.nodes.reduce<number[]>((indexes, node, index) => {
        const belongsToConcept =
          node.id === linkedConceptId ||
          (node.data.kind === 'quiz' &&
            (node.data as QuizData).parentConceptId === linkedConceptId);
        if (belongsToConcept) indexes.push(index);
        return indexes;
      }, []);
      const lastIndex = parentAndQuizIndexes.at(-1);
      if (lastIndex !== undefined) insertionIndex = lastIndex + 1;
    }
    const updatedNodes = [...liveSession.nodes];
    updatedNodes.splice(insertionIndex, 0, noteNode);
    updateCurrent({ nodes: updatedNodes }, sessionId);
  }, [currentConcept?.id, session, updateCurrent]);

  const handleRetryConcept = useCallback(
    async (conceptId: string) => {
      if (!currentId) return;
      setRetryingConceptIds((previous) => new Set(previous).add(conceptId));
      try {
        const recovered = await retryFailedConcept(currentId, conceptId);
        useToastStore
          .getState()
          .add(recovered ? 'Concept recovered' : 'Retry failed. You can try again or skip it.');
      } finally {
        setRetryingConceptIds((previous) => {
          const next = new Set(previous);
          next.delete(conceptId);
          return next;
        });
      }
    },
    [currentId],
  );

  const handleSkipConcept = useCallback(
    async (conceptId: string) => {
      if (!currentId) return;
      await skipFailedConcept(currentId, conceptId);
      useToastStore.getState().add('Concept skipped. You can retry it later.');
    },
    [currentId],
  );

  const [caption, setCaption] = useState<string>('');
  const [captionVisible, setCaptionVisible] = useState<boolean>(false);
  const [captionAnnouncement, setCaptionAnnouncement] = useState<string>('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExport, setShowExport] = useState(false);

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

  const [showOutline, setShowOutline] = useState(false);

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
  // reveals its quizzes; char progress keeps the concept visible.
  useEffect(() => {
    if (!immersiveNotebook || !session) return;

    const currentConcept = concepts.find((c) => c.data.index === currentConceptIndex);
    if (!currentConcept) return;

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
      // No-op: auto-scroll on every character was too jumpy.
    };

    const subId = ttsManager.subscribe(currentConcept.id, {
      onSegmentEnd,
      onCharProgress,
    });

    return () => {
      ttsManager.unsubscribe(subId);
    };
  }, [immersiveNotebook, currentConceptIndex, session, concepts, focusOnActiveConcept]);

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
      if (ttsEnabled && !prefersReducedMotion) {
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
    prefersReducedMotion,
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
    if (!immersiveNotebook || !session || !prefersReducedMotion) return;
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
  }, [
    immersiveNotebook,
    session,
    concepts,
    currentConceptIndex,
    focusOnActiveConcept,
    prefersReducedMotion,
  ]);

  // Stop TTS narration when exiting notebook mode. Narration may start while
  // the pipeline is still generating — the auto-enqueue effect only reads
  // concepts whose body has been populated, so partial content is never read.
  useEffect(() => {
    if (!notebookMode) {
      ttsManager.stop();
    }
  }, [notebookMode]);

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
      setCaptionAnnouncement('');
      return;
    }

    const subId = ttsManager.subscribe('__caption__', {
      onSegmentStart: () => {
        setCaptionAnnouncement('Narration started.');
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
        setCaptionAnnouncement('Narration finished.');
      },
    });

    return () => {
      ttsManager.unsubscribe(subId);
      setCaptionVisible(false);
      setCaptionAnnouncement('');
    };
  }, [notebookMode]);

  // Hide the caption when narration is fully stopped/idle (no active segment).
  useEffect(() => {
    if (!ttsPlaying && !ttsPaused) {
      setCaptionVisible(false);
    }
  }, [ttsPlaying, ttsPaused]);

  // On TTS stop (playing/paused -> idle/stopped), refocus the active concept
  // so the user returns to it after narration ends.
  useEffect(() => {
    let prev: string | null = null;
    const unsub = ttsManager.subscribeState((state) => {
      const fireFinalFit = prev === 'playing' && (state === 'idle' || state === 'stopped');
      prev = state;
      if (!fireFinalFit || !immersiveNotebook || !session) return;
      const active = concepts.find((c) => c.data.index === currentConceptIndex);
      if (!active) return;
      focusOnActiveConcept(active.id, true);
    });
    return unsub;
  }, [immersiveNotebook, session, concepts, currentConceptIndex, focusOnActiveConcept]);

  // Focus the first concept when restoring a session, restoring any previously
  // revealed quizzes from the reading position so the user picks up where they left off.
  useEffect(() => {
    if (!immersiveNotebook || !session || orientedSessionRef.current === session.id) return;

    orientedSessionRef.current = session.id;

    const nbPosKey = currentId ? `quizify:nbpos:${currentId}` : null;
    let restored = false;
    if (nbPosKey) {
      try {
        const raw = localStorage.getItem(nbPosKey);
        if (raw) {
          const pos = JSON.parse(raw) as {
            conceptIndex?: number;
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
  }, [immersiveNotebook, session, concepts, focusOnActiveConcept, currentId]);

  // Debounced save of the reading position whenever it changes.
  useEffect(() => {
    if (!immersiveNotebook || !currentId) return;
    const nbPosKey = `quizify:nbpos:${currentId}`;
    const handle = setTimeout(() => {
      try {
        const payload = {
          conceptIndex: currentConceptIndex,
          revealedQuizIds: Array.from(revealedQuizIds),
        };
        localStorage.setItem(nbPosKey, JSON.stringify(payload));
      } catch {
        /* storage unavailable — non-fatal */
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [immersiveNotebook, currentId, currentConceptIndex, revealedQuizIds]);

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
      // Pin: these scores were migrated from `summary-quiz-${session.id}`, so
      // they must land on that session, not on whatever `currentId` is now.
      updateCurrent({ scores }, session.id);
      scoreMigratedRef.current = true;
    } catch {
      scoreMigratedRef.current = true;
    }
  }, [session, updateCurrent]);

  const handleUpdateScores = useCallback(
    (scores: Record<string, { best: number; attempts: number }>) => {
      if (!session) return;
      // Pin: these scores belong to the session the summary quiz was opened on.
      updateCurrent({ scores }, session.id);
    },
    [session, updateCurrent],
  );

  const handleKbEscape = useCallback(() => {
    if (activeQuiz) setActiveQuiz(null);
    else if (summaryQuiz) setSummaryQuiz(false);
  }, [activeQuiz, summaryQuiz]);

  const handleKbHelp = useCallback(() => {
    setShowShortcuts(true);
  }, []);

  const cycleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
    setTheme(next);
  }, [setTheme, theme]);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  // Global keyboard shortcuts: N = add note, ? = help, Escape = close quiz
  useKeyboardShortcuts({
    enabled: !isMobile,
    onAddNote: handleAddNote,
    onEscape: handleKbEscape,
    onShowHelp: handleKbHelp,
  });

  if (!session || (visibleNodes.length === 0 && !isGenerating)) {
    return (
      <div className={styles.empty}>
        <p>We couldn&apos;t load this lesson. Try starting a new one or refresh the page.</p>
        {onHome && (
          <button className={styles.emptyAction} onClick={onHome} type="button">
            Start a new lesson
          </button>
        )}
      </div>
    );
  }

  if (visibleNodes.length === 0 && isGenerating) {
    return (
      <div className={styles.buildingState}>
        <div className={styles.buildingOrb} aria-hidden />
        <p className={styles.buildingLabel}>Building your lesson</p>
        {progress?.label && <p>{progress.label}</p>}
      </div>
    );
  }

  const showProgress = isGenerating && progress && progress.stage !== 'done';
  const showStreamingNotice =
    isGenerating && !!currentConcept && currentQuizIds.length === 0 && visibleNodes.length > 0;
  const failedConcepts = concepts.filter((concept) => concept.data.generationStatus === 'failed');
  const hasHiddenCurrentQuizzes = currentQuizIds.some((id) => !revealedQuizIds.has(id));
  const completionCopy = 'You reviewed every concept.';
  const sourceExplanation =
    session?.sourceProvenance === 'fetched'
      ? 'Fetched directly from the source URL and cached locally.'
      : session?.sourceProvenance === 'topic-generated'
        ? 'Generated from the topic because the source could not be read.'
        : 'Source provenance has not been fully verified.';
  const saveStatusLabel = isGenerating ? 'Updating lesson…' : 'Saved locally';
  const sourceLabel = session?.sourceProvenance
    ? session.sourceProvenance === 'fetched'
      ? 'Source: fetched source'
      : session.sourceProvenance === 'topic-generated'
        ? 'Source: generated from topic'
        : 'Source: not verified'
    : '';
  const sourceTooltip = session
    ? [sourceLabel, `Lesson URL: ${session.url}`, `Stored locally in IndexedDB`].join('\n')
    : undefined;

  const renderNode = (canvasNode: CanvasNode) => {
    const kind = canvasNode.data.kind;
    const isActionable = kind !== 'note' && kind !== 'image';
    const accessibleLabel =
      kind === 'concept'
        ? `Concept ${(canvasNode.data as ConceptData).index + 1}: ${(canvasNode.data as ConceptData).title}`
        : kind === 'quiz'
          ? `Quiz: ${(canvasNode.data as QuizData).prompt}`
          : kind === 'summary'
            ? 'Open final quiz summary'
            : undefined;
    return (
      <div
        key={canvasNode.id}
        className={styles.nodeItem}
        role={isActionable ? 'button' : undefined}
        tabIndex={isActionable ? 0 : undefined}
        aria-label={accessibleLabel}
        data-node-type={kind}
        data-concept-id={kind === 'concept' ? canvasNode.id : undefined}
        id={
          kind === 'concept' && (canvasNode.data as ConceptData).index === 0
            ? 'quizify-first-concept'
            : undefined
        }
        onClick={() => isActionable && handleNodeClick(canvasNode)}
        onKeyDown={(event) => {
          if (!isActionable || event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleNodeClick(canvasNode);
          }
        }}
      >
        {kind === 'concept' && (
          <ConceptNode
            id={canvasNode.id}
            data={canvasNode.data as ConceptData}
            currentConceptIndex={currentConceptIndex}
            isGenerating={isGenerating}
            onClick={() => handleNodeClick(canvasNode)}
          />
        )}
        {kind === 'quiz' && (
          <QuizNode
            id={canvasNode.id}
            data={canvasNode.data as QuizData}
            currentConceptIndex={currentConceptIndex}
            revealed={revealedQuizIds.has(canvasNode.id)}
            onClick={() => handleNodeClick(canvasNode)}
          />
        )}
        {kind === 'summary' && (
          <SummaryNode
            id={canvasNode.id}
            data={canvasNode.data as SummaryData}
            onClick={() => handleNodeClick(canvasNode)}
          />
        )}
        {kind === 'note' && (
          <NoteNode
            id={canvasNode.id}
            data={canvasNode.data as NoteData}
            linkedConceptTitle={conceptTitles.get(
              (canvasNode.data as NoteData).linkedConceptId ?? '',
            )}
          />
        )}
        {kind === 'image' && <ImageNode id={canvasNode.id} data={canvasNode.data as ImageData} />}
      </div>
    );
  };

  if (isMobile && session) {
    return (
      <MobileFocusView
        nodes={[...orderedVisibleNodes, ...looseNotes]}
        progress={progress}
        isGenerating={isGenerating}
        onHome={onHome}
        onAddNote={handleAddNote}
      />
    );
  }

  return (
    <ErrorBoundary
      name="Canvas"
      fallback={(error: Error, reset: () => void) => (
        <CanvasErrorFallback error={error} onReset={reset} onHome={onHome ?? (() => {})} />
      )}
    >
      <main
        ref={containerRef}
        className={styles.container}
        data-notebook="true"
        data-generating={isGenerating ? 'true' : undefined}
        aria-label="Lesson"
        tabIndex={-1}
      >
        <div className={styles.scrollArea}>
          <a className={styles.skipLink} href="#quizify-first-concept">
            Skip to lesson
          </a>
          {nextAction?.kind === 'complete' && (
            <section className={styles.completionBanner} aria-label="Lesson complete">
              <strong>Lesson complete</strong>
              <span>{completionCopy}</span>
            </section>
          )}
          <div className={styles.nodeGrid}>
            {conceptGroups.map((group, idx) => (
              <div key={idx} className={styles.conceptColumn}>
                {group.map(renderNode)}
              </div>
            ))}
          </div>
          {looseNotes.length > 0 && (
            <section className={styles.looseNotes} aria-labelledby="loose-notes-heading">
              <h2 id="loose-notes-heading">Loose notes</h2>
              <div className={styles.nodeGrid}>{looseNotes.map(renderNode)}</div>
            </section>
          )}

          {showProgress && (
            <div className={styles.progressBadge}>
              <span className={styles.progressDot} aria-hidden />
              {progress.label}
            </div>
          )}

          {showStreamingNotice && (
            <div className={styles.streamingNotice} role="status">
              More sections are generating — review this one, then continue as they arrive.
            </div>
          )}

          {failedConcepts.length > 0 && (
            <section className={styles.recoveryPanel} aria-label="Lesson generation issues">
              <AlertTriangle size={16} aria-hidden />
              <div className={styles.recoveryCopy}>
                <strong>
                  {failedConcepts.length} concept{failedConcepts.length === 1 ? '' : 's'} need
                  attention
                </strong>
                <span>Retry now or skip to keep learning.</span>
              </div>
              <div className={styles.recoveryActions}>
                {failedConcepts.map((concept) => (
                  <div key={concept.id} className={styles.recoveryItem}>
                    <span>{concept.data.title}</span>
                    <button
                      type="button"
                      onClick={() => handleRetryConcept(concept.id)}
                      disabled={retryingConceptIds.has(concept.id)}
                    >
                      <RefreshCw size={12} aria-hidden />
                      {retryingConceptIds.has(concept.id) ? 'Retrying' : 'Retry'}
                    </button>
                    <button type="button" onClick={() => handleSkipConcept(concept.id)}>
                      Skip
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {notebookMode && captionVisible && caption && (
            <div className="notebookCaption" aria-hidden="true">
              {caption}
            </div>
          )}

          {notebookMode && (
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {captionAnnouncement}
            </div>
          )}

          {notebookMode && showOrientationCue && (
            <div className="notebookOrientation" role="status" aria-live="polite">
              <div className="notebookOrientationCopy">
                <span className="notebookOrientationLabel">Start here</span>
                <span className="notebookOrientationText">
                  This lesson is centered on the current concept. Let the narration guide you, then
                  open the quiz when you're ready.
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
                <button
                  className="notebookLearningCueAction"
                  onClick={handleCueAction}
                  type="button"
                >
                  {nextAction.kind === 'review'
                    ? 'Review now'
                    : nextAction.kind === 'continue'
                      ? 'Continue'
                      : 'Start lesson'}
                </button>
              )}
              <button
                className="notebookLearningCueClose"
                onClick={dismissLearningCueLocal}
                type="button"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        {/* end scrollArea */}

        {notebookMode && hasHiddenCurrentQuizzes && currentQuizIds.length > 0 && (
          <button className={styles.continueToQuiz} type="button" onClick={revealCurrentQuizzes}>
            Continue to quiz
          </button>
        )}

        {notebookMode && (
          <>
            <div className={styles.lessonMetaRow}>
              {session?.sourceProvenance && (
                <details className={styles.sourceDetails}>
                  <summary
                    className={styles.sourceBadge}
                    title={sourceTooltip}
                    aria-label={sourceLabel}
                  >
                    {sourceLabel}
                  </summary>
                  <div className={styles.sourceDetailsBody}>
                    <p>{sourceExplanation}</p>
                    <p className={styles.sourceUrl}>{session.url}</p>
                    <a href={session.url} target="_blank" rel="noopener noreferrer">
                      Open source
                    </a>
                  </div>
                </details>
              )}
              <span className={styles.saveStatus}>{saveStatusLabel}</span>
            </div>
            <div className="notebookControls">
              {concepts.length > 0 && (
                <span className="notebookConceptProgress">
                  Concept {currentConceptIndex + 1} of {concepts.length}
                </span>
              )}
              <button onClick={handleAddNote} title="Add note" aria-label="Add note" type="button">
                <Plus size={14} />
              </button>
              <button
                onClick={handleKbHelp}
                title="Keyboard shortcuts"
                aria-label="Keyboard shortcuts"
                type="button"
              >
                <CircleHelp size={14} />
              </button>
              <button
                onClick={cycleTheme}
                title={`Theme: ${theme}`}
                aria-label={`Theme: ${theme}`}
                type="button"
              >
                <ThemeIcon size={14} />
              </button>
              <button
                onClick={() => setShowExport(true)}
                title="Export session"
                aria-label="Export session"
                type="button"
              >
                <Download size={14} />
              </button>
              {showExport && (
                <AccessibleDialog
                  labelledBy="export-heading"
                  onClose={() => setShowExport(false)}
                  initialFocusSelector="button:first-of-type"
                  overlayClassName={styles.exportOverlay}
                  panelClassName={styles.exportDialog}
                >
                  <h2 id="export-heading">Export Session</h2>
                  <p>Choose a format to export your study session.</p>
                  <div className={styles.exportActions}>
                    <button onClick={handleExportJson} type="button">
                      JSON
                    </button>
                    <button onClick={handleExportMarkdown} type="button">
                      Markdown
                    </button>
                  </div>
                  <button
                    onClick={() => setShowExport(false)}
                    type="button"
                    className={styles.exportCancel}
                  >
                    Cancel
                  </button>
                </AccessibleDialog>
              )}
              <button
                onClick={() => setShowOutline((v) => !v)}
                title="Table of contents"
                aria-label="Table of contents"
                aria-expanded={showOutline}
                aria-controls="notebook-outline"
                type="button"
              >
                <List size={14} />
              </button>
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                title={ttsEnabled ? 'Mute narration' : 'Unmute narration'}
                aria-label="Narration"
                aria-pressed={ttsEnabled}
                type="button"
              >
                {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button
                onClick={() => ttsManager.skip()}
                title="Skip segment"
                aria-label="Skip narration segment"
                disabled={!ttsPlaying && !ttsPaused}
                type="button"
              >
                <SkipForward size={14} />
              </button>
              <button
                onClick={handlePlayPause}
                title={ttsPaused ? 'Resume' : ttsPlaying ? 'Pause' : 'Play narration'}
                aria-label={
                  ttsPaused ? 'Resume narration' : ttsPlaying ? 'Pause narration' : 'Play narration'
                }
                type="button"
              >
                {ttsPaused ? (
                  <Play size={14} />
                ) : ttsPlaying ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
              <button
                onClick={handleStopTts}
                title="Stop"
                aria-label="Stop narration"
                disabled={!ttsPlaying && !ttsPaused}
                type="button"
              >
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

        {notebookMode && showShortcuts && (
          <AccessibleDialog
            label="Keyboard shortcuts"
            onClose={() => setShowShortcuts(false)}
            overlayClassName="notebookOutlineOverlay"
            panelClassName="notebookOutlinePanel"
            initialFocusSelector=".notebookOutlineClose"
          >
            <div className="notebookOutlineHeader">
              <span className="notebookOutlineTitle">Keyboard shortcuts</span>
              <button
                className="notebookOutlineClose"
                onClick={() => setShowShortcuts(false)}
                aria-label="Close keyboard shortcuts"
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="notebookOutlineList" role="list">
              <div className="notebookOutlineItem" role="listitem">
                <strong>N</strong>
                <span>Add note</span>
              </div>
              <div className="notebookOutlineItem" role="listitem">
                <strong>?</strong>
                <span>Open keyboard shortcuts</span>
              </div>
              <div className="notebookOutlineItem" role="listitem">
                <strong>Esc</strong>
                <span>Close quiz or dialog</span>
              </div>
            </div>
          </AccessibleDialog>
        )}

        {notebookMode && showOutline && session && (
          <AccessibleDialog
            label="Table of contents"
            onClose={() => setShowOutline(false)}
            overlayClassName="notebookOutlineOverlay"
            panelClassName="notebookOutlinePanel"
            initialFocusSelector=".notebookOutlineClose"
          >
            <div className="notebookOutlineHeader">
              <span className="notebookOutlineTitle">Contents</span>
              <button
                className="notebookOutlineClose"
                onClick={() => setShowOutline(false)}
                aria-label="Close contents"
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="notebookOutlineList">
              {visibleNodes.map((n) => {
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
                    type="button"
                  >
                    <span className="notebookOutlineKind">{kindLabel}</span>
                    <span className="notebookOutlineItemTitle">{title}</span>
                  </button>
                );
              })}
            </div>
          </AccessibleDialog>
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
              notebookMode={notebookMode}
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
      </main>
    </ErrorBoundary>
  );
}
