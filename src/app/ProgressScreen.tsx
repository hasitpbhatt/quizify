import { useEffect, useRef, useState } from 'react';
import type { JourneyProgress, JourneyStage, JourneyState } from './App';
import { SnakeGame } from './SnakeGame';
import type { SourceProvenance } from '@/shared/types';
import styles from './ProgressScreen.module.css';

interface DisplayStage {
  id: string;
  label: string;
  hint: string;
}

const DISPLAY_STAGES: DisplayStage[] = [
  {
    id: 'reading',
    label: 'Preparing first concept',
    hint: 'Reading the source and sketching the lesson outline',
  },
  {
    id: 'building',
    label: 'Lesson open',
    hint: 'The lesson is visible while the rest keeps building',
  },
  { id: 'ready', label: 'Ready to learn', hint: 'You can start reviewing now' },
];

const STAGE_MAP: Record<string, string> = {
  fetch: 'reading',
  outline: 'building',
  detail: 'building',
  quiz: 'building',
  summary: 'building',
  build: 'building',
  done: 'ready',
};

function stageIndex(stage: JourneyStage): number {
  const displayId = STAGE_MAP[stage] ?? 'reading';
  const i = DISPLAY_STAGES.findIndex((s) => s.id === displayId);
  return i === -1 ? 0 : i;
}

interface ProgressScreenProps {
  progress: JourneyProgress;
  error: string | null;
  onCancel: () => void;
  previewData?: {
    title: string;
    snippet: string;
    provenance: SourceProvenance;
    url: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null;
}

export function ProgressScreen({ progress, error, onCancel, previewData }: ProgressScreenProps) {
  const activeIndex = progress.stage === 'error' ? 0 : stageIndex(progress.stage);
  const [mounted, setMounted] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [progress.stage, error, previewData, showGame]);

  function getState(i: number): JourneyState {
    return progress.stage === 'error' && i <= activeIndex
      ? 'error'
      : i < activeIndex
        ? 'done'
        : i === activeIndex
          ? progress.stage === 'done'
            ? 'done'
            : 'active'
          : 'pending';
  }

  if (previewData && !error) {
    return (
      <div className={styles.screen}>
        <div className={styles.card} ref={cardRef} tabIndex={-1}>
          <div className={styles.header}>
            <div className={styles.orb} aria-hidden>
              <span className={styles.orbCore} />
              <span className={styles.orbRing} />
              <span className={styles.orbRing2} />
            </div>
            <h1 className={styles.title}>Confirm lesson source</h1>
            <p className={styles.subtitle}>
              {previewData.provenance === 'topic-generated'
                ? 'We could not read the page, so this lesson was generated from its topic.'
                : 'This cached source predates source verification. Check the preview before continuing.'}
            </p>
          </div>

          <div className={styles.previewBox}>
            <h3 className={styles.previewTitle}>{previewData.title}</h3>
            <p className={styles.previewSnippet}>{previewData.snippet}</p>
            <p className={styles.previewSource}>{previewData.url}</p>
          </div>

          <div className={styles.previewFooter}>
            <button
              className={styles.previewCancelBtn}
              onClick={previewData.onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.previewConfirmBtn}
              onClick={previewData.onConfirm}
              type="button"
            >
              Use this lesson
            </button>
          </div>
        </div>
        <div className={styles.ambient} aria-hidden data-mounted={mounted} />
      </div>
    );
  }

  if (showGame && !error) {
    return (
      <div className={styles.screen}>
        <div className={styles.card} ref={cardRef} tabIndex={-1}>
          <div className={styles.compactBar}>
            {DISPLAY_STAGES.map((s, i) => {
              const state = getState(i);
              return (
                <div
                  key={s.id}
                  className={`${styles.compactStage} ${styles[`compactStage-${state}`] ?? ''}`}
                >
                  <span className={styles.compactDot}>
                    {state === 'done' && <span className={styles.compactDotDone} />}
                    {state === 'active' && <span className={styles.compactDotActive} />}
                    {state === 'pending' && <span className={styles.compactDotPending} />}
                    {state === 'error' && <span className={styles.compactDotError} />}
                  </span>
                  <span className={styles.compactLabel}>{s.id}</span>
                </div>
              );
            })}
          </div>
          <SnakeGame paused={progress.stage === 'done'} />
          <div className={styles.gameFooter}>
            <button className={styles.cancelLink} onClick={() => setShowGame(false)} type="button">
              ← Progress
            </button>
          </div>
        </div>
        <div className={styles.ambient} aria-hidden data-mounted={mounted} />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card} ref={cardRef} tabIndex={-1}>
        <div className={styles.header}>
          <div className={styles.orb} aria-hidden>
            <span className={styles.orbCore} />
            <span className={styles.orbRing} />
            <span className={styles.orbRing2} />
          </div>
          <h1 className={styles.title}>
            {progress.stage === 'done' ? 'Lesson ready' : 'Opening lesson'}
          </h1>
          <p className={styles.subtitle} aria-live="polite">
            {progress.label}
          </p>
        </div>

        <ol className={styles.stages} aria-live="polite">
          {DISPLAY_STAGES.map((s, i) => {
            const state = getState(i);
            return (
              <li
                key={s.id}
                className={`${styles.stage} ${styles[`stage-${state}`] ?? ''}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <span className={styles.mark}>
                  {state === 'done' && <Checkmark />}
                  {state === 'active' && <span className={styles.dotPulse} />}
                  {state === 'pending' && <span className={styles.dotEmpty} />}
                  {state === 'error' && <span className={styles.dotError} />}
                </span>
                <span className={styles.stageLabel}>{s.label}</span>
                <span className={styles.stageHint}>
                  {state === 'done' ? 'Done' : state === 'active' ? s.hint : ''}
                </span>
              </li>
            );
          })}
        </ol>

        {error ? (
          <div className={styles.errorBox}>
            <p className={styles.errorText}>{error}</p>
            <button className={styles.cancelBtn} onClick={onCancel} type="button">
              Go back
            </button>
          </div>
        ) : (
          <div className={styles.footer}>
            <button className={styles.cancelLink} onClick={onCancel} type="button">
              Cancel
            </button>
            <button className={styles.gameToggle} onClick={() => setShowGame(true)} type="button">
              🐍 Play Snake
            </button>
          </div>
        )}
      </div>

      <div className={styles.ambient} aria-hidden data-mounted={mounted} />
    </div>
  );
}

function Checkmark() {
  return (
    <svg viewBox="0 0 16 16" className={styles.check} aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
