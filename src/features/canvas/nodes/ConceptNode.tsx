import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './ConceptNode.module.css';

import type { ConceptData } from '@/shared/types';

function ConceptNodeComponent(props: NodeProps) {
  const data = props.data as unknown as ConceptData;

  return (
    <div className={styles.node}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.title}>{data.title}</div>
      <div className={styles.explanation}>{data.explanation}</div>
      <div className={styles.footer}>
        <span className={styles.quizBadge}>Concepts</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const ConceptNode = memo(ConceptNodeComponent);
