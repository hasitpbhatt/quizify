import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './SummaryNode.module.css';
import type { SummaryData } from '@/shared/types';

function SummaryNodeComponent(props: NodeProps) {
  const data = props.data as unknown as SummaryData;

  return (
    <div className={styles.node}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.header}>Summary</div>
      <div className={styles.recap}>
        {data.recap.map((item, i) => (
          <div key={i} className={styles.recapItem}>{item}</div>
        ))}
      </div>
      <div className={styles.quizCount}>
        {data.finalQuiz.length} final quiz question{data.finalQuiz.length !== 1 ? 's' : ''}
      </div>
      {data.results ? (
        <div className={styles.results}>
          <div className={styles.resultsPct}>{data.results.masteryPct}%</div>
          <div>Mastery</div>
        </div>
      ) : (
        <button className={styles.launchBtn}>
          Take Final Quiz
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const SummaryNode = memo(SummaryNodeComponent);
