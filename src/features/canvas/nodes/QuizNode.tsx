import { memo, useEffect, useRef } from 'react';
import styles from './QuizNode.module.css';
import type { QuizData } from '@/shared/types';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

interface QuizNodeProps {
  id: string;
  data: QuizData;
  currentConceptIndex: number;
  revealed: boolean;
  onClick: () => void;
}

const badgeColors: Record<string, { bg: string; text: string }> = {
  untested: { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)' },
  inProgress: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  correct: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  incorrect: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  partial: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  mastered: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
};

const formatColors: Record<string, string> = {
  multipleChoice: '#5457E8',
  trueFalse: '#E0617A',
  shortAnswer: '#3DA8BE',
  freeText: '#9B6DD6',
  fillBlank: '#E0A24A',
  ordering: '#4BAE6F',
};

function QuizNodeInner({ id, data, revealed, onClick }: QuizNodeProps) {
  const formatLabel = data.format
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  const bc = badgeColors[data.state] ?? badgeColors.untested;
  const nodeRef = useRef<HTMLDivElement>(null);
  const prevStateRef = useRef(data.state);

  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const showFullText = useNotebookStore((s) => s.showFullText);
  const { revealed: typingRevealed, skipAnimation } = useTypingAnimation(
    id,
    data.prompt,
    !revealed || showFullText,
    80,
  );
  const promptText = notebookMode ? data.prompt.slice(0, typingRevealed) : data.prompt;
  const promptParagraphs =
    notebookMode && promptText.length > 0 ? promptText.split(/\n+/) : [data.prompt];
  const isAnimating = notebookMode && revealed && typingRevealed < data.prompt.length;

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = data.state;
    if (prev === data.state) return;
    const el = nodeRef.current;
    if (!el) return;
    if (data.state === 'correct' || data.state === 'mastered') {
      el.classList.remove(styles.animateCorrect, styles.animateIncorrect);
      void el.offsetWidth;
      el.classList.add(styles.animateCorrect);
    } else if (data.state === 'incorrect') {
      el.classList.remove(styles.animateCorrect, styles.animateIncorrect);
      void el.offsetWidth;
      el.classList.add(styles.animateIncorrect);
    }
  }, [data.state]);

  return (
    <div
      ref={nodeRef}
      className={styles.node}
      data-node-type="quiz"
      data-state={data.state}
      onClick={(event) => {
        if (isAnimating) {
          event.stopPropagation();
          skipAnimation();
        } else {
          onClick();
        }
      }}
    >
      <div className={styles.format}>
        <span
          className={styles.formatDot}
          style={{ background: formatColors[data.format] ?? 'var(--accent)' }}
          aria-hidden="true"
        />
        {formatLabel}
      </div>
      <div className={styles.prompt}>
        {notebookMode
          ? promptParagraphs.map((p, i) => (
              <p
                key={i}
                className={styles.promptPara}
                data-typing={isAnimating && i === promptParagraphs.length - 1 ? 'true' : undefined}
              >
                {p}
              </p>
            ))
          : data.prompt}
      </div>
      <div className={styles.footer}>
        <span className={styles.badge} style={{ background: bc.bg, color: bc.text }}>
          {data.state}
        </span>
        {isAnimating ? (
          <span className={styles.revealHint}>Click to reveal faster</span>
        ) : (
          <span className={styles.answerHint}>
            {data.attempts.length > 0
              ? `${data.attempts.length} attempt${data.attempts.length > 1 ? 's' : ''}`
              : 'click to answer'}
          </span>
        )}
      </div>
    </div>
  );
}

function QuizNodeWrapper(props: QuizNodeProps) {
  return (
    <ErrorBoundary name="QuizNode" fallback={<NodeErrorFallback nodeId={props.id} type="quiz" />}>
      <QuizNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const QuizNode = memo(QuizNodeWrapper);
