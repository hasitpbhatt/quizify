import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Volume2, Loader2, Square } from 'lucide-react';
import styles from './ConceptNode.module.css';
import { fetchTtsBlob } from '@/lib/llm/tts';
import type { ConceptData } from '@/shared/types';

function ConceptNodeComponent(props: NodeProps) {
  const data = props.data as unknown as ConceptData;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    const textToRead = `${data.title}. ${data.explanation}`;
    
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
    <div className={styles.node}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.title}>{data.title}</div>
      <div className={styles.explanation}>{data.explanation}</div>
      <div className={styles.footer}>
        <span className={styles.quizBadge}>Concepts</span>
        <button onClick={handlePlay} className={styles.playButton} disabled={isLoading} title="Listen">
          {isLoading ? <Loader2 size={14} className={styles.spin} /> : isPlaying ? <Square size={14} /> : <Volume2 size={14} />}
          {isPlaying ? 'Stop' : 'Listen'}
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeComponent);
