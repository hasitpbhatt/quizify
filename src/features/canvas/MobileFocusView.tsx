import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ReactFlow, Background, MiniMap, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CanvasNode, QuizData, ConceptData } from '@/shared/types';
import { QuizInteraction } from '@/features/quiz/QuizInteraction';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import { Play, Pause, Square, List } from 'lucide-react';
import styles from './MobileFocusView.module.css';

interface Props {
  nodes: CanvasNode[];
  progress?: { stage: string; label: string };
}

function formatKind(node: CanvasNode): string {
  const d = node.data;
  if (d.kind === 'concept') return 'Concept';
  if (d.kind === 'quiz') {
    return d.format.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
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
    const statusLine = d.attempts.length > 0
      ? 'Attempts: ' + d.attempts.length + ' \u00b7 ' + d.state
      : '';
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

export function MobileFocusView({ nodes, progress }: Props) {
  const [index, setIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<{ quizId: string; quiz: QuizData; conceptTitle: string } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Clamp index when nodes shrink
  useEffect(() => {
    if (nodes.length === 0) {
      setIndex(0);
    } else {
      setIndex(i => Math.min(i, nodes.length - 1));
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

  const notebookMode = useNotebookStore(s => s.notebookMode);
  const ttsPlaying = useNotebookStore(s => s.ttsPlaying);
  const ttsPaused = useNotebookStore(s => s.ttsPaused);
  const segmentIndex = useNotebookStore(s => s.segmentIndex);
  const totalSegments = useNotebookStore(s => s.totalSegments);

  const handlePlayPause = useCallback(() => {
    if (ttsPaused) {
      ttsManager.resume();
    } else if (!ttsPlaying) {
      if (node) {
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
  }, [ttsPlaying, ttsPaused, node]);

  const handleStopTts = useCallback(() => {
    ttsManager.stop();
  }, []);

  // Auto-TTS on card change in notebook mode, with dedup check
  useEffect(() => {
    if (!notebookMode || !node) return;
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
  const { title, body } = useMemo(
    () => (node ? renderContent(node) : { body: '' }),
    [node],
  );

  const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex(i => Math.min(nodes.length - 1, i + 1)), [nodes.length]);

  const openQuiz = useCallback(() => {
    if (!node || node.data.kind !== 'quiz') return;
    const conceptTitle = conceptTitles.get(node.data.parentConceptId) ?? 'Concept';
    setActiveQuiz({ quizId: node.id, quiz: node.data, conceptTitle });
  }, [node, conceptTitles]);

  const closeQuiz = useCallback(() => {
    setActiveQuiz(null);
  }, []);

  const isGenerating = progress && progress.stage !== 'done';

  const outlineItemClass = (isCurrent: boolean) => {
    return [styles.outlineItem, isCurrent ? styles.activeOutlineItem : ''].filter(Boolean).join(' ');
  };

  return (
    <div className={styles.wrapper} data-notebook={notebookMode ? 'true' : undefined}>
      {isGenerating && (
        <div className={styles.progressBar}>
          <span className={styles.progressDot} />
          <span className={styles.progressLabel}>{progress.label}</span>
        </div>
      )}

      <div className={styles.topActions}>
        <button className={styles.topActionBtn} onClick={() => setShowOutline(v => !v)}>
          <List size={14} />
          <span>Outline</span>
        </button>
        <button className={styles.topActionBtn} onClick={() => setShowMinimap(v => !v)}>
          {showMinimap ? '\u2715 Map' : '\u2630 Map'}
        </button>
      </div>

      <div className={styles.card} ref={cardRef}>
        {node ? (
          <div className={styles.nodeContent}>
            <div className={styles.kindTag}>{kindLabel}</div>
            {title && <div className={styles.title}>{title}</div>}
            {body && <div className={styles.body}>{body}</div>}
            {node.data.kind === 'quiz' && (
              <button className={styles.answerBtn} onClick={openQuiz}>
                {(node.data as QuizData).attempts.length > 0 ? 'Answer again' : 'Answer quiz'}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.emptyCard}>No content to display</div>
        )}
      </div>

      {notebookMode && (
        <div className={styles.mobileTtsControls}>
          <button onClick={handlePlayPause} className={styles.playPauseBtn} title="Play/Pause">
            {ttsPaused ? <Play size={14} /> : ttsPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={handleStopTts} className={styles.stopBtn} disabled={!ttsPlaying && !ttsPaused} title="Stop">
            <Square size={14} />
          </button>
          <span className={styles.mobileTtsLabel}>
            {totalSegments > 0
              ? (segmentIndex + 1) + ' / ' + totalSegments
              : 'Queued'}
          </span>
        </div>
      )}

      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={goPrev} disabled={index === 0 || total === 0} aria-label="Previous node">
          &lsaquo;
        </button>
        <span className={styles.counter}>{total > 0 ? (index + 1) + ' / ' + total : '0 / 0'}</span>
        <button className={styles.navBtn} onClick={goNext} disabled={index === total - 1 || total === 0} aria-label="Next node">
          &rsaquo;
        </button>
      </div>

      {activeQuiz && (
        <QuizInteraction
          quiz={activeQuiz.quiz}
          quizId={activeQuiz.quizId}
          conceptTitle={activeQuiz.conceptTitle}
          onClose={closeQuiz}
        />
      )}

      {showOutline && (
        <div className={styles.outlineOverlay} onClick={() => setShowOutline(false)} role="dialog" aria-modal="true" aria-label="Outline">
          <div className={styles.outlinePanel} onClick={e => e.stopPropagation()}>
            <div className={styles.outlineHeader}>
              <span className={styles.outlineHeaderTitle}>Outline</span>
              <button className={styles.closeOutlineBtn} onClick={() => setShowOutline(false)} aria-label="Close outline">\u2715</button>
            </div>
            <div className={styles.outlineList}>
              {nodes.map((n, i) => {
                const isCurrent = i === index;
                const kind = formatKind(n);
                const { title: nodeTitle } = renderContent(n);
                const displayTitle = nodeTitle || (n.data.kind === 'note' ? n.data.text.slice(0, 30) + '...' : kind);
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
          <div className={styles.minimapPanel} onClick={e => e.stopPropagation()}>
            <button className={styles.closeMinimapBtn} onClick={() => setShowMinimap(false)}>\u2715</button>
            <ReactFlow
              nodes={nodes.map(n => ({
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