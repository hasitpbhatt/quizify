import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Volume2, Loader2, Square } from 'lucide-react';
import styles from './ConceptNode.module.css';
import { fetchTtsBlob } from '@/lib/llm/tts';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import type { ConceptData } from '@/shared/types';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

function toConceptData(data: Record<string, unknown>): ConceptData {
  if (data.kind !== 'concept') throw new Error(`Expected concept data, got ${String(data.kind)}`);
  return data as unknown as ConceptData;
}

function ConceptNodeInner(props: NodeProps) {
  const data = toConceptData(props.data);
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const textToRead = `${data.title}. ${data.explanation}`;
  const skipTyping = props.data.skipTyping === true;
  const { revealed, isAnimating, skipAnimation } = useTypingAnimation(
    props.id,
    textToRead,
    skipTyping,
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entered, setEntered] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const prevExample = useRef(data.example);

  useEffect(() => {
    if (prevExample.current === 'Loading...' && data.example !== 'Loading...') {
      setEntered(true);
    }
    prevExample.current = data.example;
  }, [data.example]);

  const isShell = data.generationStatus === 'generating';
  const hasFailed = data.generationStatus === 'failed';
  const isLocked = props.data.isLocked === true && !notebookMode;

  // Cleanup audio resources on unmount — only cancel speech if this node
  // was the one speaking (notebook narration uses ttsManager, not per-node).
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (currentBlobUrlRef.current) {
          URL.revokeObjectURL(currentBlobUrlRef.current);
          currentBlobUrlRef.current = null;
        }
      }
      if (isPlaying && !ttsManager.isPlaying) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (!ttsManager.isPlaying) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);

    try {
      const blob = await fetchTtsBlob(textToRead);
      if (blob) {
        // Revoke previous blob URL before creating a new one
        if (currentBlobUrlRef.current) {
          URL.revokeObjectURL(currentBlobUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        currentBlobUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => setIsPlaying(false);
        await audio.play();
        setIsPlaying(true);
      } else {
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, textToRead]);

  const titleText = data.title;
  const explanationText = data.explanation;
  const titlePrefixLength = titleText.length + 2;

  const titleRevealed = notebookMode ? Math.min(revealed, titleText.length) : titleText.length;
  const explanationRevealed = notebookMode
    ? Math.max(0, revealed - titlePrefixLength)
    : explanationText.length;
  const explanationVisible = notebookMode
    ? explanationText.slice(0, explanationRevealed)
    : explanationText;
  const explanationParagraphs = (notebookMode ? explanationVisible : explanationText)
    .split(/\n+/)
    .filter(Boolean);

  const isTitleAnimating = notebookMode && revealed < titleText.length;
  const isExplanationAnimating =
    notebookMode && revealed >= titleText.length && revealed < textToRead.length;

  const nodeClass = [
    styles.node,
    isShell ? styles.loading : '',
    entered ? styles.entered : '',
    isLocked ? styles.locked : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={nodeClass}
      onClick={() => {
        if (isAnimating) skipAnimation();
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className={styles.title} data-typing={isTitleAnimating ? 'true' : undefined}>
        {notebookMode ? titleText.slice(0, titleRevealed) : titleText}
        {isLocked && <span className={styles.lockedBadge}>Locked</span>}
      </div>
      <div
        className={styles.explanation}
        data-typing={isExplanationAnimating ? 'true' : undefined}
        aria-hidden={isLocked ? true : undefined}
      >
        {isLocked ? (
          <p className={styles.explanationPara}>Complete earlier concepts to unlock this one.</p>
        ) : (
          explanationParagraphs.map((p, i) => (
            <p
              key={i}
              className={styles.explanationPara}
              data-typing={
                notebookMode && isExplanationAnimating && i === explanationParagraphs.length - 1
                  ? 'true'
                  : undefined
              }
            >
              {p}
            </p>
          ))
        )}
      </div>
      {hasFailed && (
        <div role="alert" className={styles.generationError}>
          This concept could not be generated. Use Retry or Skip in the lesson recovery panel.
        </div>
      )}
      {!notebookMode && (
        <div className={styles.footer}>
          {data.streaming ? (
            <span className={styles.streamingBadge}>
              <span className={styles.streamingDot} />
              Receiving
            </span>
          ) : (
            <span className={styles.quizBadge}>Concepts</span>
          )}
          <button
            onClick={handlePlay}
            className={styles.playButton}
            disabled={isLoading}
            title="Listen"
          >
            {isLoading ? (
              <Loader2 size={14} className={styles.spin} />
            ) : isPlaying ? (
              <Square size={14} />
            ) : (
              <Volume2 size={14} />
            )}
            {isPlaying ? 'Stop' : 'Listen'}
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConceptNodeWrapper(props: NodeProps) {
  return (
    <ErrorBoundary
      name="ConceptNode"
      fallback={<NodeErrorFallback nodeId={props.id} type="concept" />}
    >
      <ConceptNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const ConceptNode = memo(ConceptNodeWrapper);
