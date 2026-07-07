import { useState, useEffect, useRef } from 'react';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useNotebookStore } from '@/shared/stores/notebookStore';

/**
 * useTypingAnimation
 *
 * Returns the number of characters to reveal for a given node's text.
 * In notebook mode, starts at 0 and increments as TTS progresses.
 * Falls back to a local timer if TTS doesn't start within 2 seconds.
 * In default mode, reveals the full text immediately.
 */
export function useTypingAnimation(nodeId: string, fullText: string) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const [revealed, setRevealed] = useState(fullText.length);
  const hasHadTts = useRef(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!notebookMode || fullText.length === 0) {
      setRevealed(fullText.length);
      return;
    }

    setRevealed(0);
    hasHadTts.current = false;

    // Fallback: if no TTS starts for this node within 2s, animate locally
    fallbackTimeoutRef.current = setTimeout(() => {
      if (!hasHadTts.current && fullText.length > 0) {
        const totalChars = fullText.length;
        const CHARS_PER_TICK = 2;
        const INTERVAL_MS = 40;
        fallbackIntervalRef.current = setInterval(() => {
          setRevealed((prev) => {
            const next = prev + CHARS_PER_TICK;
            if (next >= totalChars) {
              if (fallbackIntervalRef.current) {
                clearInterval(fallbackIntervalRef.current);
                fallbackIntervalRef.current = null;
              }
              return totalChars;
            }
            return next;
          });
        }, INTERVAL_MS);
      }
    }, 2000);

    const onStart = (nid: string) => {
      if (nid === nodeId) {
        hasHadTts.current = true;
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
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

    ttsManager.subscribe(nodeId, {
      onSegmentStart: onStart,
      onCharProgress: onProgress,
      onSegmentEnd: onEnd,
    });

    return () => {
      ttsManager.unsubscribe(nodeId);
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
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
