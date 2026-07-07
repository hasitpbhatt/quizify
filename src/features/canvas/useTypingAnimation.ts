import { useState, useEffect, useRef } from 'react';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useNotebookStore } from '@/shared/stores/notebookStore';

/**
 * useTypingAnimation
 *
 * Returns the number of characters to reveal for a given node's text.
 * In notebook mode, starts at 0 and increments as TTS progresses.
 * In default mode, reveals the full text immediately.
 */
export function useTypingAnimation(nodeId: string, fullText: string) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const [revealed, setRevealed] = useState(fullText.length);
  const hasHadTts = useRef(false);

  useEffect(() => {
    if (!notebookMode) {
      setRevealed(fullText.length);
      return;
    }

    setRevealed(0);

    const onStart = (nid: string) => {
      if (nid === nodeId) {
        hasHadTts.current = true;
        setRevealed(0);
      }
    };

    const onProgress = (nid: string, charIndex: number) => {
      if (nid === nodeId) {
        setRevealed(Math.min(charIndex, fullText.length));
      }
    };

    const onEnd = (nid: string) => {
      if (nid === nodeId) {
        setRevealed(fullText.length);
      }
    };

    ttsManager.setCallbacks({
      onSegmentStart: onStart,
      onCharProgress: onProgress,
      onSegmentEnd: onEnd,
    });

    return () => {
      if (!hasHadTts.current) {
        setRevealed(fullText.length);
      }
    };
  }, [nodeId, fullText, notebookMode]);

  useEffect(() => {
    if (!notebookMode) {
      setRevealed(fullText.length);
    }
  }, [notebookMode, fullText]);

  return { revealed, isAnimating: revealed < fullText.length };
}
