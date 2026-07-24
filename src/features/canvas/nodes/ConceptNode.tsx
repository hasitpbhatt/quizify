import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, Loader2, Square } from 'lucide-react';
import styles from './ConceptNode.module.css';
import { fetchTtsBlob } from '@/lib/llm/tts';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import type { ConceptData } from '@/shared/types';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

interface ConceptNodeProps {
  id: string;
  data: ConceptData;
  currentConceptIndex: number;
  isGenerating: boolean;
  onClick: () => void;
}

function ConceptNodeInner({ id, data, currentConceptIndex, onClick }: ConceptNodeProps) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const textToRead = `${data.title}. ${data.explanation}`;
  const skipTyping = data.index < currentConceptIndex;
  const { revealed, isAnimating, skipAnimation } = useTypingAnimation(id, textToRead, skipTyping);

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
  const isLocked = data.index > currentConceptIndex;

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
        else onClick();
      }}
    >
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
      <div className={styles.footer}>
        {data.streaming ? (
          <span className={styles.streamingBadge}>
            <span className={styles.streamingDot} />
            Receiving
          </span>
        ) : (
          <span className={styles.quizBadge}>Concept {data.index + 1}</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlay();
          }}
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
    </div>
  );
}

function ConceptNodeWrapper(props: ConceptNodeProps) {
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
