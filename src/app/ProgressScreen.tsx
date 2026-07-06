import { useEffect, useState } from 'react';
import type { JourneyProgress, JourneyStage, JourneyState } from './App';
import styles from './ProgressScreen.module.css';

interface StageDef {
  stage: JourneyStage;
  label: string;
  hint: string;
}

const STAGES: StageDef[] = [
  { stage: 'fetch', label: 'Reading the source', hint: 'Fetching the article' },
  { stage: 'outline', label: 'Sketching an outline', hint: 'Picking the key concepts' },
  { stage: 'detail', label: 'Writing explanations', hint: 'Teaching each concept' },
  { stage: 'quiz', label: 'Crafting quizzes', hint: 'Turning knowledge into questions' },
  { stage: 'summary', label: 'Summing it up', hint: 'Recap & final challenge' },
  { stage: 'build', label: 'Arranging the canvas', hint: 'Laying out your cards' },
  { stage: 'done', label: 'Ready', hint: 'Almost there…' },
];

function stageIndex(stage: JourneyStage): number {
  const i = STAGES.findIndex(s => s.stage === stage);
  return i === -1 ? 0 : i;
}

interface ProgressScreenProps {
  progress: JourneyProgress;
  error: string | null;
  onCancel: () => void;
}

export function ProgressScreen({ progress, error, onCancel }: ProgressScreenProps) {
  const activeIndex = progress.stage === 'error' ? 0 : stageIndex(progress.stage);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.orb} aria-hidden>
            <span className={styles.orbCore} />
            <span className={styles.orbRing} />
            <span className={styles.orbRing2} />
          </div>
          <h1 className={styles.title}>
            {progress.stage === 'done' ? 'Almost ready' : 'Building your canvas'}
          </h1>
          <p className={styles.subtitle}>{progress.label}</p>
        </div>

        <ol className={styles.stages} aria-live="polite">
          {STAGES.map((s, i) => {
            const state: JourneyState =
              progress.stage === 'error' && i <= activeIndex ? 'error' :
              i < activeIndex ? 'done' :
              i === activeIndex ? (progress.stage === 'done' ? 'done' : 'active') :
              'pending';
            return (
              <li
                key={s.stage}
                className={`${styles.stage} ${styles[`stage-${state}`] ?? ''}`}
                style={{ transitionDelay: `${i * 40}ms` }}
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
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
