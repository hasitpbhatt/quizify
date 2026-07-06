import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { NoteData, CanvasNode } from '@/shared/types';
import styles from './NoteNode.module.css';

function NoteNodeComponent(props: NodeProps) {
  const data = props.data as unknown as NoteData;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const updateCurrent = useSessionStore(s => s.updateCurrent);

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

  const handleSave = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === data.text) return;

    const node = (props as unknown as { id: string }).id;
    const store = useSessionStore.getState();
    const session = store.sessions.find(s => s.id === store.currentId);
    if (!session) return;

    const updatedNodes: CanvasNode[] = session.nodes.map(n =>
      n.id === node
        ? { ...n, data: { ...n.data, text: trimmed } as NoteData }
        : n
    );
    updateCurrent({ nodes: updatedNodes });
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

  const handleDelete = useCallback(() => {
    const nodeId = (props as unknown as { id: string }).id;
    const store = useSessionStore.getState();
    const session = store.sessions.find(s => s.id === store.currentId);
    if (!session) return;

    const updatedNodes = session.nodes.filter(n => n.id !== nodeId);
    const updatedEdges = session.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    updateCurrent({ nodes: updatedNodes, edges: updatedEdges });
  }, [props, updateCurrent]);

  return (
    <div className={styles.node} onDoubleClick={handleDoubleClick}>
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

export const NoteNode = memo(NoteNodeComponent);
