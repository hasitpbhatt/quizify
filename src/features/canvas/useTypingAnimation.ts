import { useState, useEffect, useRef, useCallback } from 'react';
import { ttsManager } from '@/lib/llm/ttsManager';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useMediaQuery } from '@/shared/useMediaQuery';

/**
 * useTypingAnimation
 *
 * Reveals text character-by-character ONLY in sync with TTS narration.
 * When TTS is disabled or not playing, text appears immediately (no animation).
 * Once a node has fully revealed, it stays complete on revisits.
 */
export function useTypingAnimation(nodeId: string, fullText: string, skipAnimation = false) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const hasTypingCompleted = useNotebookStore((s) => Boolean(s.completedTypingNodeIds[nodeId]));
  const markTypingComplete = useNotebookStore((s) => s.markTypingComplete);

  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const shouldAnimate =
    notebookMode &&
    fullText.length > 0 &&
    !skipAnimation &&
    ttsEnabled &&
    !prefersReducedMotion &&
    !hasTypingCompleted;

  const [revealed, setRevealed] = useState(fullText.length);
  const targetRef = useRef(fullText.length);
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

    const chaseInterval = setInterval(() => {
      setRevealed((prev) => Math.min(targetRef.current, prev + 1));
    }, 50);

    const onStart = (nid: string) => {
      if (nid !== nodeId) return;
      targetRef.current = 0;
    };

    const onProgress = (nid: string, charIndex: number) => {
      if (nid !== nodeId) return;
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

    const safetyTimeout = setTimeout(() => {
      if (targetRef.current >= fullText.length) return;
      if (ttsManager.isPlaying && ttsManager.currentSegmentId === nodeId) return;
      targetRef.current = fullText.length;
      setRevealed(fullText.length);
      markTypingComplete(nodeId);
    }, 8000);

    return () => {
      ttsManager.unsubscribe(subId);
      clearInterval(chaseInterval);
      clearTimeout(safetyTimeout);
    };
  }, [nodeId, fullText, shouldAnimate, markTypingComplete]);

  const skip = useCallback(() => {
    const text = fullTextRef.current;
    ttsManager.finishSegment(nodeId);
    markTypingComplete(nodeId);
    targetRef.current = text.length;
    setRevealed(text.length);
  }, [nodeId, markTypingComplete]);

  return {
    revealed,
    isAnimating: shouldAnimate && revealed < fullText.length,
    skipAnimation: skip,
  };
}
