import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './QuizNode.module.css';
import type { QuizData } from '@/shared/types';

const badgeColors: Record<string, { bg: string; text: string }> = {
  untested: { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)' },
  inProgress: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  correct: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  incorrect: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  partial: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  mastered: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
};

function QuizNodeComponent(props: NodeProps) {
  const data = props.data as unknown as QuizData;
  const formatLabel = data.format
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();

  const bc = badgeColors[data.state] ?? badgeColors.untested;

  return (
    <div className={styles.node}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.format}>{formatLabel}</div>
      <div className={styles.prompt}>{data.prompt}</div>
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

export const QuizNode = memo(QuizNodeComponent);
