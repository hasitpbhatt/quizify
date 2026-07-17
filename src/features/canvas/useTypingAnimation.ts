import { useState, useEffect, useRef } from 'react';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useNotebookStore } from '@/shared/stores/notebookStore';

/**
 * useTypingAnimation
 *
 * Reveals text in sync with notebook narration.
 * Once a node has fully revealed, it stays complete on revisits so movement
 * around the notebook does not replay the typing effect.
 */
export function useTypingAnimation(nodeId: string, fullText: string, skipAnimation = false) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const hasTypingCompleted = useNotebookStore((s) => s.hasTypingCompleted(nodeId));
  const markTypingComplete = useNotebookStore((s) => s.markTypingComplete);
  const [revealed, setRevealed] = useState(fullText.length);
  const [displayedRevealed, setDisplayedRevealed] = useState(fullText.length);
  const targetRef = useRef(fullText.length);
  const hasHadTts = useRef(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    targetRef.current = revealed;
  }, [revealed]);

  useEffect(() => {
    const shouldSkip = !notebookMode || fullText.length === 0 || skipAnimation || prefersReducedMotion || hasTypingCompleted;

    if (shouldSkip) {
      setRevealed(fullText.length);
      setDisplayedRevealed(fullText.length);
      targetRef.current = fullText.length;
      if (notebookMode && fullText.length > 0) {
        markTypingComplete(nodeId);
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

    fallbackTimeoutRef.current = setTimeout(() => {
      if (!hasHadTts.current && fullText.length > 0) {
        const totalChars = fullText.length;
        fallbackIntervalRef.current = setInterval(() => {
          setRevealed((prev) => {
            const next = prev + 1;
            if (next >= totalChars) {
              if (fallbackIntervalRef.current) {
                clearInterval(fallbackIntervalRef.current);
                fallbackIntervalRef.current = null;
              }
              setDisplayedRevealed(totalChars);
              targetRef.current = totalChars;
              markTypingComplete(nodeId);
              ttsManager.finishSegment(nodeId);
              return totalChars;
            }
            return next;
          });
        }, 25);
      }
    }, 2000);

    const onStart = (nid: string) => {
      if (nid !== nodeId) return;
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
    };

    const onProgress = (nid: string, charIndex: number) => {
      if (nid !== nodeId) return;
      setRevealed((prev) => Math.max(prev, Math.min(charIndex, fullText.length)));
    };

    const onEnd = (nid: string) => {
      if (nid !== nodeId) return;
      setRevealed(fullText.length);
      setDisplayedRevealed(fullText.length);
      targetRef.current = fullText.length;
      markTypingComplete(nodeId);
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
        setDisplayedRevealed(fullText.length);
        targetRef.current = fullText.length;
      }
    };
  }, [nodeId, fullText, notebookMode, skipAnimation, prefersReducedMotion, hasTypingCompleted, markTypingComplete]);

  useEffect(() => {
    if (!notebookMode || skipAnimation || prefersReducedMotion || hasTypingCompleted) {
      setDisplayedRevealed(fullText.length);
      return;
    }

    chaseIntervalRef.current = setInterval(() => {
      setDisplayedRevealed((prev) => {
        const target = targetRef.current;
        if (prev < target) {
          return prev + 1;
        }
        if (prev >= fullText.length) {
          if (chaseIntervalRef.current) {
            clearInterval(chaseIntervalRef.current);
            chaseIntervalRef.current = null;
          }
        }
        return prev;
      });
    }, 20);

    return () => {
      if (chaseIntervalRef.current) {
        clearInterval(chaseIntervalRef.current);
        chaseIntervalRef.current = null;
      }
    };
  }, [notebookMode, skipAnimation, fullText.length, prefersReducedMotion, hasTypingCompleted]);

  useEffect(() => {
    if (!notebookMode || skipAnimation || prefersReducedMotion || hasTypingCompleted) {
      setRevealed(fullText.length);
      setDisplayedRevealed(fullText.length);
    }
  }, [notebookMode, fullText, skipAnimation, prefersReducedMotion, hasTypingCompleted]);

  return { revealed: displayedRevealed, isAnimating: displayedRevealed < fullText.length };
}
