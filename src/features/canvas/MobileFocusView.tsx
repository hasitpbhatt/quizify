import { useState, useMemo, useCallback } from 'react';
import { ReactFlow, Background, MiniMap, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CanvasNode, ConceptData, QuizData, NoteData, SummaryData } from '@/shared/types';
import styles from './MobileFocusView.module.css';

interface Props {
  nodes: CanvasNode[];
}

function renderNodeBody(node: CanvasNode): { kindLabel: string; title?: string; body: string } {
  const d = node.data;
  if (d.kind === 'concept') {
    const c = d as ConceptData;
    return { kindLabel: 'Concept', title: c.title, body: `${c.explanation}\n\n${c.example}` };
  }
  if (d.kind === 'quiz') {
    const q = d as QuizData;
    return { kindLabel: q.format, title: q.prompt, body: q.rationale };
  }
  if (d.kind === 'note') {
    const n = d as NoteData;
    return { kindLabel: 'Note', body: n.text };
  }
  if (d.kind === 'summary') {
    const s = d as SummaryData;
    return { kindLabel: 'Summary', title: `${s.recap.length} recap points`, body: s.recap.join('\n') };
  }
  return { kindLabel: 'Node', body: '' };
}

export function MobileFocusView({ nodes }: Props) {
  const [index, setIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState(false);
  const node = nodes[index];
  const total = nodes.length;

  const { kindLabel, title, body } = useMemo(
    () => (node ? renderNodeBody(node) : { kindLabel: '', body: '' }),
    [node],
  );

  const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex(i => Math.min(total - 1, i + 1)), [total]);

  if (!node) {
    return <div className={styles.wrapper}><div className={styles.card}>No nodes</div></div>;
  }

  return (
    <div className={styles.wrapper}>
      <button className={styles.minimapBtn} onClick={() => setShowMinimap(v => !v)}>
        {showMinimap ? '✕ Map' : '☰ Map'}
      </button>

      <div className={styles.card}>
        <div className={styles.nodeContent}>
          <div className={styles.kindTag}>{kindLabel}</div>
          {title && <div className={styles.title}>{title}</div>}
          <div className={styles.body}>{body}</div>
        </div>
      </div>

      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={goPrev} disabled={index === 0}>‹</button>
        <span className={styles.counter}>{index + 1} / {total}</span>
        <button className={styles.navBtn} onClick={goNext} disabled={index === total - 1}>›</button>
      </div>

      {showMinimap && (
        <div className={styles.minimapOverlay} onClick={() => setShowMinimap(false)}>
          <div className={styles.minimapPanel} onClick={e => e.stopPropagation()}>
            <button className={styles.closeMinimapBtn} onClick={() => setShowMinimap(false)}>✕</button>
            <ReactFlow
              nodes={nodes.map(n => ({
                id: n.id,
                type: n.type,
                position: n.position,
                data: n.data as unknown as Record<string, unknown>,
              }))}
              edges={[]}
              fitView
              panOnDrag={false}
              zoomOnScroll={false}
              nodesDraggable={false}
              nodesConnectable={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={0.5} />
              <MiniMap
                nodeColor="var(--accent)"
                maskColor="rgba(0,0,0,0.1)"
                style={{ width: '100%', height: '100%' }}
              />
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
}
