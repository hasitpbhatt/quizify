import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './ConceptNode.module.css';

export type ConceptNodeData = {
  label: string;
  explanation: string;
  quizCount: number;
  conceptId: string;
};

function ConceptNodeComponent(props: NodeProps) {
  const data = props.data as ConceptNodeData;

  return (
    <div className={styles.node}>
      <Handle type="target" position={Position.Top} />
      <div className={styles.title}>{data.label}</div>
      <div className={styles.explanation}>{data.explanation}</div>
      <div className={styles.footer}>
        <span className={styles.quizBadge}>{data.quizCount} quiz</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="quiz" />
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeComponent);
