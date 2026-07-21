import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLatencyStore } from '@/shared/stores/latencyStore';
import { useIsMobile } from '@/shared/useMediaQuery';
import styles from './LatencyPanel.module.css';

function subscribe(cb: () => void) {
  return useLatencyStore.subscribe(cb);
}

function getSnapshot() {
  return useLatencyStore.getState();
}

export function LatencyPanel() {
  const isMobile = useIsMobile();
  const [now, setNow] = useState(performance.now());
  const rafRef = useRef<number>(0);
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setNow(performance.now());
      useLatencyStore.getState().tick();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!store.visible || !store.overallStart) return null;

  const overallElapsed = Math.round(now - store.overallStart);
  const overallSec = Math.floor(overallElapsed / 1000);
  const overallMin = Math.floor(overallSec / 60);
  const overallStr = overallMin > 0 ? `${overallMin}m ${overallSec % 60}s` : `${overallSec}s`;

  function stageDuration(entry: { startTime: number; endTime?: number }): string {
    const end = entry.endTime ?? now;
    const ms = Math.round(end - entry.startTime);
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function stageIcon(entry: { endTime?: number; stage: string }) {
    if (entry.endTime) return <span className={styles.iconDone}>✓</span>;
    return entry.stage === 'done' ? (
      <span className={styles.iconDone}>✓</span>
    ) : (
      <span className={styles.iconRunning} />
    );
  }

  return (
    <div
      className={isMobile ? styles.mobileBar : styles.panel}
      role="status"
      aria-label="Generation latency debug panel"
    >
      {isMobile ? (
        <>
          <span className={styles.metaLabel}>⏱ {overallStr}</span>
          <span className={styles.metaLabel}>📞 {store.callCount}</span>
          <span className={styles.metaLabel}>⚡ {store.rpm}/min</span>
          <button
            className={styles.dismissBtn}
            onClick={() => useLatencyStore.getState().setVisible(false)}
            type="button"
            aria-label="Close debug panel"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.title}>⏱ Latency</span>
            <button
              className={styles.dismissBtn}
              onClick={() => useLatencyStore.getState().setVisible(false)}
              type="button"
              aria-label="Close debug panel"
            >
              ✕
            </button>
          </div>

          <div className={styles.meta}>
            <span className={styles.metaLabel}>
              Elapsed: <strong>{overallStr}</strong>
            </span>
            <span className={styles.metaLabel}>
              LLM calls: <strong>{store.callCount}</strong>
            </span>
            <span className={styles.metaLabel}>
              Rate: <strong>{store.rpm}/min</strong>
            </span>
          </div>

          <div className={styles.stages}>
            {store.entries.map((entry) => (
              <div key={entry.stage} className={styles.stageRow} data-ended={!!entry.endTime}>
                {stageIcon(entry)}
                <span className={styles.stageLabel}>{entry.label}</span>
                <span className={styles.stageDuration}>{stageDuration(entry)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
