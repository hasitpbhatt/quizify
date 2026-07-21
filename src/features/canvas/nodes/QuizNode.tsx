import { memo, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './QuizNode.module.css';
import type { QuizData } from '@/shared/types';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

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

function toQuizData(data: Record<string, unknown>): QuizData {
  if (data.kind !== 'quiz') throw new Error(`Expected quiz data, got ${String(data.kind)}`);
  return data as unknown as QuizData;
}

function QuizNodeInner(props: NodeProps) {
  const data = toQuizData(props.data);
  const formatLabel = data.format
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();

  const bc = badgeColors[data.state] ?? badgeColors.untested;
  const nodeRef = useRef<HTMLDivElement>(null);
  const prevStateRef = useRef(data.state);

  const notebookMode = useNotebookStore((s) => s.notebookMode);
  const skipTyping = props.data.skipTyping === true;
  const { revealed, skipAnimation } = useTypingAnimation(props.id, data.prompt, skipTyping, 80);
  const promptText = notebookMode ? data.prompt.slice(0, revealed) : data.prompt;
  const promptParagraphs = notebookMode && promptText.length > 0
    ? promptText.split(/\n+/)
    : [data.prompt];
  const isAnimating = notebookMode && !skipTyping && revealed < data.prompt.length;

  // Replay animation when state changes to correct/mastered/incorrect
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = data.state;
    if (prev === data.state) return;
    const el = nodeRef.current;
    if (!el) return;
    if (data.state === 'correct' || data.state === 'mastered') {
      el.classList.remove(styles.animateCorrect, styles.animateIncorrect);
      void el.offsetWidth; // force reflow
      el.classList.add(styles.animateCorrect);
    } else if (data.state === 'incorrect') {
      el.classList.remove(styles.animateCorrect, styles.animateIncorrect);
      void el.offsetWidth;
      el.classList.add(styles.animateIncorrect);
    }
  }, [data.state]);

  return (
    <div ref={nodeRef} className={styles.node} data-node-type="quiz" data-state={data.state} onClick={() => { if (isAnimating) skipAnimation(); }}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.format}>
        <span
          className={styles.formatDot}
          style={{ background: formatColors[data.format] ?? 'var(--accent)' }}
          aria-hidden="true"
        />
        {formatLabel}
      </div>
      <div className={styles.prompt}>
        {notebookMode ? (
          promptParagraphs.map((p, i) => (
            <p
              key={i}
              className={styles.promptPara}
              data-typing={isAnimating && i === promptParagraphs.length - 1 ? 'true' : undefined}
            >
              {p}
            </p>
          ))
        ) : (
          data.prompt
        )}
      </div>
      <div className={styles.footer}>
        <span
          className={styles.badge}
          style={{ background: bc.bg, color: bc.text }}
        >
          {data.state}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {data.attempts.length > 0 ? `${data.attempts.length} attempt${data.attempts.length > 1 ? 's' : ''}` : 'click to answer'}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function QuizNodeWrapper(props: NodeProps) {
  return (
    <ErrorBoundary name="QuizNode" fallback={<NodeErrorFallback nodeId={props.id} type="quiz" />}>
      <QuizNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const QuizNode = memo(QuizNodeWrapper);
