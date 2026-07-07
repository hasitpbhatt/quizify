import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './SummaryNode.module.css';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import type { SummaryData } from '@/shared/types';

function SummaryNodeComponent(props: NodeProps) {
  const data = props.data as unknown as SummaryData;
  const notebookMode = useNotebookStore((s) => s.notebookMode);

  // Build cumulative character offsets for each recap bullet
  const { fullText, bulletOffsets } = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;
    for (const item of data.recap) {
      offsets.push(total);
      total += item.length + 2; // +2 for ". " separator (not added after last)
    }
    // Remove trailing ". " from the final calculation
    const ft = data.recap.join('. ');
    return { fullText: ft, bulletOffsets: offsets };
  }, [data.recap]);

  const { revealed, isAnimating } = useTypingAnimation(props.id, fullText);

  const renderRecap = () => {
    if (!notebookMode || !isAnimating) {
      // Default: render as full bullet list
      return data.recap.map((item, i) => (
        <div key={i} className={styles.recapItem}>{item}</div>
      ));
    }

    // Notebook mode + animating: render completed bullets + partial current
    const items: React.ReactNode[] = [];
    for (let i = 0; i < data.recap.length; i++) {
      const bulletStart = bulletOffsets[i];
      const bulletEnd = bulletStart + data.recap[i].length;

      if (revealed >= bulletEnd) {
        // This bullet is fully revealed
        items.push(
          <div key={i} className={styles.recapItem}>{data.recap[i]}</div>
        );
      } else if (revealed > bulletStart) {
        // This bullet is partially revealed
        const partialText = fullText.slice(bulletStart, revealed);
        items.push(
          <div key={i} className={styles.recapItem}>
            {partialText}
            <span className="notebookCursor" />
          </div>
        );
        // Remaining bullets are hidden
        break;
      } else {
        // This bullet hasn't started yet — stop rendering
        break;
      }
    }

    return items;
  };

  return (
    <div className={styles.node}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.header}>Summary</div>
      <div className={styles.recap}>
        {renderRecap()}
      </div>
      {!notebookMode && (
        <>
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
        </>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const SummaryNode = memo(SummaryNodeComponent);
