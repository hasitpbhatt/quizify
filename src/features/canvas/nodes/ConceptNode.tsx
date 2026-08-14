import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, Loader2, Square } from 'lucide-react';
import styles from './ConceptNode.module.css';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useMediaQuery } from '@/shared/useMediaQuery';
import type { ConceptData } from '@/shared/types';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';
import { ConceptExamples } from '@/features/canvas/components/ConceptExamples';

interface ConceptNodeProps {
  id: string;
  data: ConceptData;
  currentConceptIndex: number;
  isGenerating: boolean;
  onClick: () => void;
}

function ConceptNodeInner({ id, data, currentConceptIndex, onClick }: ConceptNodeProps) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const exampleText =
    data.example && data.example !== 'Loading...' && data.example !== 'Generating...'
      ? ` Example: ${data.example}`
      : '';
  const textToRead = `${data.title}. ${data.explanation}${exampleText}`;
  const skipTyping = data.index < currentConceptIndex;
  const { revealed, isAnimating, skipAnimation } = useTypingAnimation(id, textToRead, skipTyping);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entered, setEntered] = useState(false);
  const prevExample = useRef(data.example);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

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
      if (isPlaying && !ttsManager.isPlaying) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  const handlePlay = useCallback(async () => {
    // Respect reduced-motion: never auto-start audio narration for users who
    // opted out of motion. The button is also disabled in the UI below.
    if (prefersReducedMotion) return;

    if (isPlaying) {
      if (!ttsManager.isPlaying) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
      return;
    }

    // Stop the notebook narration before playing standalone audio so the two
    // don't overlap; the state listener above handles the reverse direction.
    // ttsManager is the single audio source — it tries the server Voxtral audio
    // and falls back to the Web Speech API, so no separate audio element is
    // needed and we never claim server TTS that may be unavailable.
    if (ttsManager.isPlaying) {
      ttsManager.stop();
    }

    setIsLoading(true);

    try {
      if (!ttsManager.speechSynthesisAvailable) {
        setIsPlaying(false);
        return;
      }
      ttsManager.setRate(1);
      ttsManager.clearQueue();
      ttsManager.enqueue({ nodeId: id, text: textToRead });
      ttsManager.start();
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, textToRead, id, prefersReducedMotion]);

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
      onClick={(event) => {
        if (isAnimating) {
          event.stopPropagation();
          skipAnimation();
        } else {
          onClick();
        }
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
      <ConceptExamples example={data.example} />
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
        {isAnimating && <span className={styles.revealHint}>Click to reveal faster</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlay();
          }}
          className={styles.playButton}
          disabled={isLoading || prefersReducedMotion}
          title={prefersReducedMotion ? 'Audio narration disabled (reduced motion)' : 'Listen'}
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
