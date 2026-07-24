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
} from '@/shared/types';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';
import { SummaryQuizInteraction } from '@/features/quiz/SummaryQuizInteraction';
import { NoteNode } from './nodes/NoteNode';
import { MobileFocusView } from './MobileFocusView';
import { useIsMobile } from '@/shared/useMediaQuery';
import { useDismissibleCue } from '@/shared/useDismissibleCue';
import {
  Play,
  Pause,
  Square,
  X,
  Volume2,
  VolumeX,
  List,
  SkipForward,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { CanvasErrorFallback } from '@/lib/components/CanvasErrorFallback';
import { QuizErrorFallback } from '@/lib/components/QuizErrorFallback';
import { ConceptNode } from './nodes/ConceptNode';
import { QuizNode } from './nodes/QuizNode';
import { SummaryNode } from './nodes/SummaryNode';
import { useKeyboardShortcuts } from '@/shared/useKeyboardShortcuts';
import { useToastStore } from '@/shared/stores/toastStore';
import { retryFailedConcept, skipFailedConcept } from '@/lib/pipeline';
import {
  getNextLearningAction,
  normalizeLearningProgress,
  type NextLearningAction,
} from '@/shared/learningProgress';
import '@/styles/notebook.css';
import styles from './CanvasPage.module.css';

function filterVisibleNodes(
  nodes: CanvasNode[],
  currentConceptIndex: number,
  revealedQuizIds: Set<string>,
  notebookMode: boolean,
): CanvasNode[] {
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
      if (!notebookMode || c.index <= currentConceptIndex) {
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
  const toggleNotebookMode = useNotebookStore((s) => s.toggleNotebookMode);
  const immersiveNotebook = notebookMode;
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsRate = useSettingsStore((s) => s.ttsRate);
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const setTtsRate = useSettingsStore((s) => s.setTtsRate);
  const ttsPlaying = useNotebookStore((s) => s.ttsPlaying);
  const ttsPaused = useNotebookStore((s) => s.ttsPaused);
  const segmentIndex = useNotebookStore((s) => s.segmentIndex);
  const totalSegments = useNotebookStore((s) => s.totalSegments);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useRef<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
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
    return filterVisibleNodes(
      session.nodes,
      currentConceptIndex,
      revealedQuizIds,
      immersiveNotebook,
    );
  }, [session, currentConceptIndex, revealedQuizIds, immersiveNotebook]);

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
        focusOnActiveConcept(canvasNode.id, true);
      }
    },
    [conceptTitles, focusOnActiveConcept],
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

    const noteId = `note-${Date.now()}`;
    const noteNode: CanvasNode = {
      id: noteId,
      type: 'note',
      data: { kind: 'note', text: '' } as NoteData,
    };

    const updatedNodes = [...session.nodes, noteNode];
    updateCurrent({ nodes: updatedNodes });
  }, [session, updateCurrent]);

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
      // Scroll the concept into view as typing progresses.
      if (containerRef.current) {
        const conceptEl = containerRef.current.querySelector(
          `[data-concept-id="${currentConcept.id}"]`,
        );
        if (conceptEl) {
          const rect = conceptEl.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 80 || rect.top < 0) {
            conceptEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
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
      .add('Shortcuts: N = Add note · ? = Show this · Esc = Close quiz / exit Tutor');
  }, []);

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
        <p>No lesson data yet.</p>
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
  const failedConcepts = concepts.filter((concept) => concept.data.generationStatus === 'failed');
  const hasHiddenCurrentQuizzes = currentQuizIds.some((id) => !revealedQuizIds.has(id));
  const summaryAvailable =
    currentConceptIndex >= concepts.length &&
    (session?.nodes.some((node) => node.id === SUMMARY_NODE_ID) ?? false);

  if (isMobile && session) {
    return (
      <MobileFocusView
        nodes={visibleNodes}
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
      <div
        ref={containerRef}
        className={styles.container}
        data-notebook="true"
        data-generating={isGenerating ? 'true' : undefined}
      >
        <div className={styles.nodeList}>
          {visibleNodes.map((canvasNode) => {
            const kind = canvasNode.data.kind;
            return (
              <div
                key={canvasNode.id}
                className={styles.nodeItem}
                data-concept-id={kind === 'concept' ? canvasNode.id : undefined}
                onClick={() => kind !== 'note' && handleNodeClick(canvasNode)}
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
                  <NoteNode id={canvasNode.id} data={canvasNode.data as NoteData} />
                )}
              </div>
            );
          })}
        </div>

        {showProgress && (
          <div className={styles.progressBadge}>
            <span className={styles.progressDot} aria-hidden />
            {progress.label}
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
              onClick={dismissLearningCueLocal}
              type="button"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {notebookMode && hasHiddenCurrentQuizzes && currentQuizIds.length > 0 && (
          <button className={styles.continueToQuiz} type="button" onClick={revealCurrentQuizzes}>
            Continue to quiz
          </button>
        )}

        {notebookMode && summaryAvailable && (
          <button
            className={styles.finalQuizAction}
            type="button"
            onClick={() => setSummaryQuiz(true)}
          >
            {Object.keys(session?.scores ?? {}).length > 0
              ? 'Review final results'
              : 'Take final quiz'}
          </button>
        )}

        {notebookMode && (
          <>
            {session?.sourceProvenance && (
              <div className={styles.sourceBadge}>
                {session.sourceProvenance === 'fetched'
                  ? 'Based on fetched source'
                  : session.sourceProvenance === 'topic-generated'
                    ? 'Generated from topic'
                    : 'Source not verified'}
              </div>
            )}
            <div className="notebookControls">
              {concepts.length > 0 && (
                <span className="notebookConceptProgress">
                  Concept {currentConceptIndex + 1} of {concepts.length}
                </span>
              )}
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
      </div>
    </ErrorBoundary>
  );
}
