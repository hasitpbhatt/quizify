import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Volume2, Loader2, Square } from 'lucide-react';
import styles from './ConceptNode.module.css';
import { fetchTtsBlob } from '@/lib/llm/tts';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import type { ConceptData } from '@/shared/types';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

function ConceptNodeInner(props: NodeProps) {
  const data = props.data as unknown as ConceptData;
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const textToRead = `${data.title}. ${data.explanation}`;
  const skipTyping = props.data.skipTyping === true;
  const { revealed, isAnimating } = useTypingAnimation(props.id, textToRead, skipTyping);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entered, setEntered] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevExample = useRef(data.example);

  useEffect(() => {
    if (prevExample.current === 'Loading...' && data.example !== 'Loading...') {
      setEntered(true);
    }
    prevExample.current = data.example;
  }, [data.example]);

  const isShell = data.example === 'Loading...';

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const handlePlay = async () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);

    try {
      const blob = await fetchTtsBlob(textToRead);
      if (blob) {
        const url = URL.createObjectURL(blob);
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
  };

  return (
    <div className={`${styles.node}${isShell ? ` ${styles.loading}` : ''}${entered ? ` ${styles.entered}` : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.title}>{data.title}</div>
      <div className={styles.explanation}>
        {notebookMode ? (
          <>
            {textToRead.slice(0, revealed)}
            {isAnimating && <span className="notebookCursor" />}
          </>
        ) : (
          data.explanation
        )}
      </div>
      {!notebookMode && (
        <div className={styles.footer}>
          <span className={styles.quizBadge}>Concepts</span>
          <button onClick={handlePlay} className={styles.playButton} disabled={isLoading} title="Listen">
            {isLoading ? <Loader2 size={14} className={styles.spin} /> : isPlaying ? <Square size={14} /> : <Volume2 size={14} />}
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
    <ErrorBoundary name="ConceptNode" fallback={<NodeErrorFallback nodeId={props.id} type="concept" />}>
      <ConceptNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const ConceptNode = memo(ConceptNodeWrapper);
