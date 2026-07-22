import { useState, useCallback, useRef, useEffect } from 'react';

interface UseDismissibleCueOptions {
  storageKey: string;
  delay?: number;
  enabled?: boolean;
}

export function useDismissibleCue({
  storageKey,
  delay = 450,
  enabled = true,
}: UseDismissibleCueOptions): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setShow(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!enabled) return;

    try {
      if (sessionStorage.getItem(storageKey) === 'seen') return;
    } catch {
      // Non-fatal.
    }

    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setShow(true);
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [storageKey, delay, enabled]);

  const dismiss = useCallback(() => {
    setShow(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      sessionStorage.setItem(storageKey, 'seen');
    } catch {
      // Non-fatal.
    }
  }, [storageKey]);

  return { show, dismiss };
}
