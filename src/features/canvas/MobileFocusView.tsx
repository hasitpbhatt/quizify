import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ReactFlow, Background, MiniMap, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  CanvasNode,
  QuizData,
  ConceptData,
  NoteData,
  SummaryData,
} from '@/shared/types';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';
import { SummaryQuizInteraction } from '@/features/quiz/SummaryQuizInteraction';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useTypingAnimation } from './useTypingAnimation';
import { Play, Pause, Square, List, Plus, Download, Volume2, VolumeX } from 'lucide-react';
import { exportSessionJson } from '@/lib/export/json';
import { downloadSessionMarkdown } from '@/lib/export/markdown';
import {
  getNextLearningAction,
  normalizeLearningProgress,
} from '@/shared/learningProgress';
import styles from './MobileFocusView.module.css';

interface Props {
  nodes: CanvasNode[];
  progress?: { stage: string; label: string };
  isGenerating?: boolean;
  onHome?: () => void;
  onAddNote?: () => void;
}

function formatKind(node: CanvasNode): string {
  const d = node.data;
  if (d.kind === 'concept') return 'Concept';
  if (d.kind === 'quiz') {
    return d.format
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }
  if (d.kind === 'note') return 'Note';
  if (d.kind === 'summary') return 'Summary';
  return 'Node';
}

function renderContent(node: CanvasNode): { title?: string; body: string } {
  const d = node.data;
  if (d.kind === 'concept') {
    return { title: d.title, body: d.explanation + '\n\n' + d.example };
  }
  if (d.kind === 'quiz') {
    const statusLine =
      d.attempts.length > 0 ? 'Attempts: ' + d.attempts.length + ' \u00b7 ' + d.state : '';
    return { title: d.prompt, body: statusLine };
  }
  if (d.kind === 'note') {
    return { body: d.text };
  }
  if (d.kind === 'summary') {
    return { title: d.recap.length + ' recap points', body: d.recap.join('\n') };
  }
  return { body: '' };
}

export function MobileFocusView({
  nodes,
  progress,
  isGenerating = false,
  onHome,
  onAddNote,
}: Props) {
  const [index, setIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<{
    quizId: string;
    quiz: QuizData;
    conceptTitle: string;
  } | null>(null);
  const [summaryQuiz, setSummaryQuiz] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useRef<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Clamp index when nodes shrink
  useEffect(() => {
    if (nodes.length === 0) {
      setIndex(0);
    } else {
      setIndex((i) => Math.min(i, nodes.length - 1));
    }
  }, [nodes.length]);

  // Reset scroll position when navigating to a new node
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.scrollTop = 0;
    }
  }, [index]);

  const node = nodes[index];
  const total = nodes.length;

  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const ttsPlaying = useNotebookStore((s) => s.ttsPlaying);
  const ttsPaused = useNotebookStore((s) => s.ttsPaused);
  const segmentIndex = useNotebookStore((s) => s.segmentIndex);
  const totalSegments = useNotebookStore((s) => s.totalSegments);

  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const ttsRate = useSettingsStore((s) => s.ttsRate);
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const setTtsRate = useSettingsStore((s) => s.setTtsRate);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const session = useSessionStore((state) =>
    state.currentId ? (state.sessions.find((item) => item.id === state.currentId) ?? null) : null,
  );
  const updateCurrent = useSessionStore((state) => state.updateCurrent);

  const handlePlayPause = useCallback(() => {
    if (ttsPaused) {
      ttsManager.resume();
    } else if (!ttsPlaying) {
      if (node && ttsEnabled) {
        ttsManager.setRate(ttsRate);
        if (node.data.kind === 'concept') {
          const text = node.data.title + '. ' + node.data.explanation;
          ttsManager.enqueue({ nodeId: node.id, text });
        } else if (node.data.kind === 'summary') {
          const text = node.data.recap.join('. ');
          ttsManager.enqueue({ nodeId: node.id, text });
        }
      }
      ttsManager.start();
    } else {
      ttsManager.pause();
    }
  }, [ttsPlaying, ttsPaused, node, ttsEnabled, ttsRate]);

  const handleStopTts = useCallback(() => {
    ttsManager.stop();
  }, []);

  // Auto-TTS on card change in notebook mode, with dedup check.
  // Gated on !prefers-reduced-motion AND the user's TTS-enabled setting to
  // match the desktop notebook behavior.
  useEffect(() => {
    if (!notebookMode || !node || prefersReducedMotion.current || !ttsEnabled) return;
    if (node.data.kind === 'concept') {
      if (ttsManager.hasSegment(node.id)) return;
      const text = node.data.title + '. ' + node.data.explanation;
      ttsManager.enqueue({ nodeId: node.id, text });
    } else if (node.data.kind === 'summary') {
      if (ttsManager.hasSegment(node.id)) return;
      const text = node.data.recap.join('. ');
      ttsManager.enqueue({ nodeId: node.id, text });
    } else {
      return;
    }
    if (!ttsManager.isPlaying && !ttsManager.isPaused) {
      ttsManager.start();
    }
  }, [notebookMode, node?.id, node?.data?.kind]);

  const conceptTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) {
      if (n.data.kind === 'concept') {
        map.set(n.id, (n.data as ConceptData).title);
      }
    }
    return map;
  }, [nodes]);

  const kindLabel = useMemo(() => (node ? formatKind(node) : ''), [node]);
  const { title, body } = useMemo(() => (node ? renderContent(node) : { body: '' }), [node]);

  // Typewriter reveal for concept/summary prose, mirroring the desktop notebook.
  const typing = useTypingAnimation(node?.id ?? '', body, false);
  const revealedBody =
    notebookMode && node && (node.data.kind === 'concept' || node.data.kind === 'summary')
      ? body.slice(0, typing.revealed)
      : body;

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(nodes.length - 1, i + 1)),
    [nodes.length],
  );

  const openQuiz = useCallback(() => {
    if (!node || node.data.kind !== 'quiz') return;
    const conceptTitle = conceptTitles.get(node.data.parentConceptId) ?? 'Concept';
    setActiveQuiz({ quizId: node.id, quiz: node.data, conceptTitle });
  }, [node, conceptTitles]);

  const closeQuiz = useCallback(() => {
    setActiveQuiz(null);
  }, []);

  const updateNote = useCallback(
    (noteId: string, text: string) => {
      if (!session) return;
      const updatedNodes = session.nodes.map((item) =>
        item.id === noteId && item.data.kind === 'note'
          ? { ...item, data: { ...item.data, text } as NoteData }
          : item,
      );
      updateCurrent({ nodes: updatedNodes });
    },
    [session, updateCurrent],
  );

  const cycleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light');
  }, [theme, setTheme]);

  const summaryData =
    node?.data.kind === 'summary' ? (node.data as SummaryData) : null;

  const lessonComplete = useMemo(() => {
    if (!session) return false;
    const conceptIds = session.nodes
      .filter((item) => item.data.kind === 'concept')
      .sort((a, b) => {
        const ai = a.data.kind === 'concept' ? a.data.index : 0;
        const bi = b.data.kind === 'concept' ? b.data.index : 0;
        return ai - bi;
      })
      .map((item) => item.id);
    if (conceptIds.length === 0) return false;
    const progressState = normalizeLearningProgress(
      session.lastConceptId,
      session.completedConceptIds,
      session.nextReviewAtByConceptId,
      session.lastActivityAt,
    );
    return getNextLearningAction(progressState, conceptIds).kind === 'complete';
  }, [session]);

  const isGeneratingProgress = isGenerating || (progress != null && progress.stage !== 'done');

  const outlineItemClass = (isCurrent: boolean) => {
    return [styles.outlineItem, isCurrent ? styles.activeOutlineItem : '']
      .filter(Boolean)
      .join(' ');
  };

  return (
    <div className={styles.wrapper} data-notebook={notebookMode ? 'true' : undefined}>
      {isGeneratingProgress && progress && (
        <div className={styles.progressBar}>
          <span className={styles.progressDot} />
          <span className={styles.progressLabel}>{progress.label}</span>
        </div>
      )}

      {lessonComplete && !isGeneratingProgress && (
        <div className={styles.completionBanner} role="status">
          <strong>Lesson complete!</strong> Take the final quiz or review any concept from the
          outline.
        </div>
      )}

      <div className={styles.topActions}>
        {onHome && (
          <button className={styles.topActionBtn} onClick={onHome}>
            <Plus size={14} />
            <span>New</span>
          </button>
        )}
        <button className={styles.topActionBtn} onClick={() => setShowOutline((v) => !v)}>
          <List size={14} />
          <span>Outline</span>
        </button>
        <button className={styles.topActionBtn} onClick={() => setShowMinimap((v) => !v)}>
          {showMinimap ? '\u2715 Close map' : '\u2630 Open map'}
        </button>
        <button className={styles.topActionBtn} onClick={cycleTheme} aria-label={`Theme: ${theme}`}>
          {theme}
        </button>
      </div>

      <div className={styles.card} ref={cardRef}>
        {node ? (
          <div className={styles.nodeContent}>
            <div className={styles.kindTag}>{kindLabel}</div>
            {title && <div className={styles.title}>{title}</div>}
            {revealedBody && (
              <div className={styles.body}>
                {revealedBody
                  .split(/\n+/)
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
              </div>
            )}
            {node.data.kind === 'quiz' && (
              <button className={styles.answerBtn} onClick={openQuiz}>
                {(node.data as QuizData).attempts.length > 0 ? 'Answer again' : 'Answer quiz'}
              </button>
            )}
            {node.data.kind === 'summary' && (
              <button className={styles.answerBtn} onClick={() => setSummaryQuiz(true)}>
                {session && Object.keys(session.scores).length > 0
                  ? 'Review final results'
                  : 'Take final quiz'}
              </button>
            )}
            {node.data.kind === 'note' && (
              <label className={styles.noteEditor}>
                <span>Edit note</span>
                <textarea
                  value={(node.data as NoteData).text}
                  onChange={(event) => updateNote(node.id, event.target.value)}
                  rows={6}
                />
              </label>
            )}
          </div>
        ) : (
          <div className={styles.emptyCard}>No content to display</div>
        )}
      </div>

      {notebookMode && (
        <div className={styles.mobileTtsControls}>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={ttsEnabled ? 'Mute narration' : 'Enable narration'}
            aria-pressed={!ttsEnabled}
          >
            {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={handlePlayPause} className={styles.playPauseBtn} title="Play/Pause">
            {ttsPaused ? <Play size={14} /> : ttsPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={handleStopTts}
            className={styles.stopBtn}
            disabled={!ttsPlaying && !ttsPaused}
            title="Stop"
          >
            <Square size={14} />
          </button>
          <span className={styles.mobileTtsLabel}>
            {totalSegments > 0 ? segmentIndex + 1 + ' / ' + totalSegments : 'Queued'}
          </span>
          <select
            value={ttsRate}
            onChange={(event) => setTtsRate(Number(event.target.value))}
            aria-label="Narration speed"
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </div>
      )}

      <div className={styles.mobileActions}>
        {onAddNote && (
          <button type="button" onClick={onAddNote}>
            <Plus size={14} /> Add note
          </button>
        )}
        <button type="button" onClick={() => setShowExport((value) => !value)}>
          <Download size={14} /> Export
        </button>
        {showExport && session && (
          <div className={styles.mobileExportMenu}>
            <button type="button" onClick={() => exportSessionJson(session)}>
              JSON
            </button>
            <button type="button" onClick={() => downloadSessionMarkdown(session)}>
              Markdown
            </button>
          </div>
        )}
      </div>

      <div className={styles.nav}>
        <button
          className={styles.navBtn}
          onClick={goPrev}
          disabled={index === 0 || total === 0}
          aria-label="Previous node"
        >
          &lsaquo;
        </button>
        <span className={styles.counter}>{total > 0 ? index + 1 + ' / ' + total : '0 / 0'}</span>
        <button
          className={styles.navBtn}
          onClick={goNext}
          disabled={index === total - 1 || total === 0}
          aria-label="Next node"
        >
          &rsaquo;
        </button>
      </div>

      {activeQuiz && (
        <QuizInteraction
          quiz={activeQuiz.quiz}
          quizId={activeQuiz.quizId}
          conceptTitle={activeQuiz.conceptTitle}
          onClose={closeQuiz}
          notebookMode={notebookMode}
        />
      )}

      {summaryQuiz && summaryData && session && (
        <SummaryQuizInteraction
          quizData={summaryData.finalQuiz}
          onClose={() => setSummaryQuiz(false)}
          onRetake={() => setSummaryQuiz(true)}
          initialScores={session.scores}
          onUpdateScores={(scores) => updateCurrent({ scores })}
        />
      )}

      {showOutline && (
        <div
          className={styles.outlineOverlay}
          onClick={() => setShowOutline(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Outline"
        >
          <div className={styles.outlinePanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.outlineHeader}>
              <span className={styles.outlineHeaderTitle}>Outline</span>
              <button
                className={styles.closeOutlineBtn}
                onClick={() => setShowOutline(false)}
                aria-label="Close outline"
              >
                \u2715
              </button>
            </div>
            <div className={styles.outlineList}>
              {nodes.map((n, i) => {
                const isCurrent = i === index;
                const kind = formatKind(n);
                const { title: nodeTitle } = renderContent(n);
                const displayTitle =
                  nodeTitle || (n.data.kind === 'note' ? n.data.text.slice(0, 30) + '...' : kind);
                return (
                  <button
                    key={n.id}
                    className={outlineItemClass(isCurrent)}
                    onClick={() => {
                      setIndex(i);
                      setShowOutline(false);
                    }}
                  >
                    <span className={styles.outlineKind}>{kind}</span>
                    <span className={styles.outlineTitle}>{displayTitle}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showMinimap && (
        <div className={styles.minimapOverlay} onClick={() => setShowMinimap(false)}>
          <div className={styles.minimapPanel} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeMinimapBtn} onClick={() => setShowMinimap(false)}>
              \u2715
            </button>
            <ReactFlow
              nodes={nodes.map((n) => ({
                id: n.id,
                type: n.type,
                position: n.position,
                data: n.data as unknown as Record<string, unknown>,
              }))}
              edges={[]}
              fitView
              panOnDrag={false}
              zoomOnScroll={false}
              nodesDraggable={false}
              nodesConnectable={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={0.5} />
              <MiniMap
                nodeColor="var(--accent)"
                maskColor="rgba(0,0,0,0.1)"
                style={{ width: '100%', height: '100%' }}
              />
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
}
