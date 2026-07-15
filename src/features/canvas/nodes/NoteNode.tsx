import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { NoteData, CanvasNode } from '@/shared/types';
import styles from './NoteNode.module.css';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';
import * as sessionsDb from '@/lib/db/sessionsDb';

function toNoteData(data: Record<string, unknown>): NoteData {
  if (data.kind !== 'note') throw new Error(`Expected note data, got ${String(data.kind)}`);
  return data as unknown as NoteData;
}

function NoteNodeInner(props: NodeProps) {
  const data = toNoteData(props.data);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const updateCurrent = useSessionStore(s => s.updateCurrent);
  // Stable random rotation: computed once based on node id hash so it's consistent across renders
  const rotation = useRef<number | null>(null);
  if (rotation.current === null) {
    // Simple deterministic hash of node ID → float in [-2, 2]
    let hash = 0;
    for (let i = 0; i < props.id.length; i++) hash = (hash * 31 + props.id.charCodeAt(i)) >>> 0;
    rotation.current = ((hash % 400) / 100) - 2; // -2 to +2 deg
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleDoubleClick = useCallback(() => {
    setEditing(true);
    setDraft(data.text);
  }, [data.text]);

  const handleSave = useCallback(async () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === data.text) return;

    const { currentId } = useSessionStore.getState();
    if (!currentId) return;
    const authoritative = await sessionsDb.getSession(currentId);
    if (!authoritative) return;

    const updatedNodes: CanvasNode[] = authoritative.nodes.map(n =>
      n.id === props.id
        ? { ...n, data: { ...n.data, text: trimmed } as NoteData }
        : n
    );
    await updateCurrent({ nodes: updatedNodes });
  }, [draft, data.text, props, updateCurrent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditing(false);
      setDraft(data.text);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  }, [data.text, handleSave]);

  const handleDelete = useCallback(async () => {
    const nodeId = props.id;
    const { currentId } = useSessionStore.getState();
    if (!currentId) return;
    const authoritative = await sessionsDb.getSession(currentId);
    if (!authoritative) return;

    const updatedNodes = authoritative.nodes.filter(n => n.id !== nodeId);
    const updatedEdges = authoritative.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    await updateCurrent({ nodes: updatedNodes, edges: updatedEdges });
  }, [props, updateCurrent]);

  return (
    <div
      className={styles.node}
      onDoubleClick={handleDoubleClick}
      style={{ '--note-rotate': `${rotation.current}deg` } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} />
      {editing ? (
        <textarea
          ref={inputRef}
          className={styles.editInput}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className={styles.text}>{data.text}</div>
      )}
      <button className={styles.deleteBtn} onClick={handleDelete} title="Delete note">×</button>
      {data.linkedConceptId && (
        <div className={styles.linkBadge}>🔗 {data.linkedConceptId}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function NoteNodeWrapper(props: NodeProps) {
  return (
    <ErrorBoundary name="NoteNode" fallback={<NodeErrorFallback nodeId={props.id} type="note" />}>
      <NoteNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const NoteNode = memo(NoteNodeWrapper);
