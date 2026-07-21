import { useState, useEffect, useRef, useCallback } from 'react';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useNotebookStore } from '@/shared/stores/notebookStore';

/**
 * useTypingAnimation
 *
 * Reveals text in sync with notebook narration.
 * Once a node has fully revealed, it stays complete on revisits so movement
 * around the notebook does not replay the typing effect.
 */
export function useTypingAnimation(
  nodeId: string,
  fullText: string,
  skipAnimation = false,
  tickMs = 35,
) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const hasTypingCompleted = useNotebookStore((s) => Boolean(s.completedTypingNodeIds[nodeId]));
  const markTypingComplete = useNotebookStore((s) => s.markTypingComplete);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate =
    notebookMode &&
    fullText.length > 0 &&
    !skipAnimation &&
    !prefersReducedMotion &&
    !hasTypingCompleted;

  const [revealed, setRevealed] = useState(() => (shouldAnimate ? 0 : fullText.length));
  const targetRef = useRef(shouldAnimate ? 0 : fullText.length);
  const hasReceivedProgressRef = useRef(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullTextRef = useRef(fullText);
  fullTextRef.current = fullText;

  useEffect(() => {
    if (!shouldAnimate) {
      setRevealed(fullText.length);
      targetRef.current = fullText.length;
      return;
    }

    setRevealed(0);
    targetRef.current = 0;
    hasReceivedProgressRef.current = false;

    // SpeechSynthesis is inconsistent about boundary events across browsers.
    // Keep the UI moving if it never starts or never reports progress.
    const startFallback = () => {
      if (hasReceivedProgressRef.current) return;

      fallbackIntervalRef.current = setInterval(() => {
        targetRef.current = Math.min(fullText.length, targetRef.current + 1);
        ttsManager.emitCharProgress(nodeId, targetRef.current);
        if (targetRef.current >= fullText.length) {
          if (fallbackIntervalRef.current) {
            clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
          }
          markTypingComplete(nodeId);
          ttsManager.finishSegment(nodeId);
        }
      }, tickMs);
    };

    fallbackTimeoutRef.current = setTimeout(startFallback, 1000);

    const chaseInterval = setInterval(() => {
      setRevealed((prev) => Math.min(targetRef.current, prev + 1));
    }, 20);

    const onStart = (nid: string) => {
      if (nid !== nodeId) return;
      targetRef.current = 0;
      hasReceivedProgressRef.current = false;
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }

      // Give normal speech-boundary events time to arrive, then recover if
      // this browser exposes speechSynthesis without emitting boundaries.
      fallbackTimeoutRef.current = setTimeout(startFallback, 800);
    };

    const onProgress = (nid: string, charIndex: number) => {
      if (nid !== nodeId) return;
      hasReceivedProgressRef.current = true;
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      targetRef.current = Math.max(targetRef.current, Math.min(charIndex, fullText.length));
    };

    const onEnd = (nid: string) => {
      if (nid !== nodeId) return;
      setRevealed(fullText.length);
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
      clearInterval(chaseInterval);
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [nodeId, fullText, shouldAnimate, markTypingComplete, tickMs]);

  const skip = useCallback(() => {
    const text = fullTextRef.current;
    ttsManager.finishSegment(nodeId);
    markTypingComplete(nodeId);
    targetRef.current = text.length;
    setRevealed(text.length);
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, [nodeId, markTypingComplete]);

  return {
    revealed,
    isAnimating: shouldAnimate && revealed < fullText.length,
    skipAnimation: skip,
  };
}
