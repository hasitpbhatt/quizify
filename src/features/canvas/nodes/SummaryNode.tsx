import { memo, useMemo } from 'react';
import styles from './SummaryNode.module.css';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import type { SummaryData } from '@/shared/types';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';

interface SummaryNodeProps {
  id: string;
  data: SummaryData;
  onClick: () => void;
}

function SummaryNodeInner({ id, data, onClick }: SummaryNodeProps) {
  const notebookMode = useNotebookStore((s) => s.notebookMode);

  const { fullText, bulletOffsets } = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;
    for (const item of data.recap) {
      offsets.push(total);
      total += item.length + 2;
    }
    const ft = data.recap.join('. ');
    return { fullText: ft, bulletOffsets: offsets };
  }, [data.recap]);

  const { revealed, isAnimating } = useTypingAnimation(id, fullText);

  const renderRecap = () => {
    if (!notebookMode || !isAnimating) {
      return data.recap.map((item, i) => (
        <div key={i} className={styles.recapItem}>
          {item}
        </div>
      ));
    }

    const items: React.ReactNode[] = [];
    for (let i = 0; i < data.recap.length; i++) {
      const bulletStart = bulletOffsets[i];
      const bulletEnd = bulletStart + data.recap[i].length;

      if (revealed >= bulletEnd) {
        items.push(
          <div key={i} className={styles.recapItem}>
            {data.recap[i]}
          </div>,
        );
      } else if (revealed > bulletStart) {
        const partialText = fullText.slice(bulletStart, revealed);
        items.push(
          <div key={i} className={styles.recapItem}>
            {partialText}
            <span className="notebookCursor" />
          </div>,
        );
        break;
      } else {
        break;
      }
    }

    return items;
  };

  return (
    <div className={styles.node} onClick={onClick}>
      <div className={styles.header}>Summary</div>
      <div className={styles.recap}>{renderRecap()}</div>
      <div className={styles.quizCount}>
        {data.finalQuiz.length} final quiz question{data.finalQuiz.length !== 1 ? 's' : ''}
      </div>
      {data.results ? (
        <div className={styles.results}>
          <div className={styles.resultsPct}>{data.results.masteryPct}%</div>
          <div>Mastery</div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryNodeWrapper(props: SummaryNodeProps) {
  return (
    <ErrorBoundary
      name="SummaryNode"
      fallback={<NodeErrorFallback nodeId={props.id} type="summary" />}
    >
      <SummaryNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const SummaryNode = memo(SummaryNodeWrapper);
