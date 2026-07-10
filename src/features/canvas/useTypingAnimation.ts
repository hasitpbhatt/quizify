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
export function useTypingAnimation(nodeId: string, fullText: string, skipAnimation = false) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const [revealed, setRevealed] = useState(fullText.length);
  const [displayedRevealed, setDisplayedRevealed] = useState(fullText.length);
  const targetRef = useRef(fullText.length);
  const hasHadTts = useRef(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync targetRef with raw revealed progress
  useEffect(() => {
    targetRef.current = revealed;
  }, [revealed]);

  useEffect(() => {
    if (!notebookMode || fullText.length === 0 || skipAnimation) {
      setRevealed(fullText.length);
      setDisplayedRevealed(fullText.length);
      targetRef.current = fullText.length;
      if (notebookMode) {
        // Run in next tick to avoid React render phase warnings
        setTimeout(() => {
          ttsManager.finishSegment(nodeId);
        }, 0);
      }
      return;
    }

    setRevealed(0);
    setDisplayedRevealed(0);
    targetRef.current = 0;
    hasHadTts.current = false;

    // Fallback: if no TTS starts for this node within 2s, animate locally
    fallbackTimeoutRef.current = setTimeout(() => {
      if (!hasHadTts.current && fullText.length > 0) {
        const totalChars = fullText.length;
        const CHARS_PER_TICK = 1;
        const INTERVAL_MS = 25;
        fallbackIntervalRef.current = setInterval(() => {
          setRevealed((prev) => {
            const next = prev + CHARS_PER_TICK;
            if (next >= totalChars) {
              if (fallbackIntervalRef.current) {
                clearInterval(fallbackIntervalRef.current);
                fallbackIntervalRef.current = null;
              }
              // Notify that typing animation finished
              ttsManager.finishSegment(nodeId);
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
        setDisplayedRevealed(0);
        targetRef.current = 0;
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

    const subId = ttsManager.subscribe(nodeId, {
      onSegmentStart: onStart,
      onCharProgress: onProgress,
      onSegmentEnd: onEnd,
    });

    return () => {
      ttsManager.unsubscribe(subId);
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
  }, [nodeId, fullText, notebookMode, skipAnimation]);

  // Smoothly chase target character count for character-by-character feel
  useEffect(() => {
    if (!notebookMode || skipAnimation) {
      setDisplayedRevealed(fullText.length);
      return;
    }

    const intervalId = setInterval(() => {
      setDisplayedRevealed((prev) => {
        const target = targetRef.current;
        if (prev < target) {
          return prev + 1;
        }
        return prev;
      });
    }, 20); // ~50 chars/sec speed

    return () => {
      clearInterval(intervalId);
    };
  }, [notebookMode, skipAnimation, fullText.length]);

  useEffect(() => {
    if (!notebookMode || skipAnimation) {
      setRevealed(fullText.length);
      setDisplayedRevealed(fullText.length);
    }
  }, [notebookMode, fullText, skipAnimation]);

  return { revealed: displayedRevealed, isAnimating: displayedRevealed < fullText.length };
}

