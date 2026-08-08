import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { NoteData, CanvasNode } from '@/shared/types';
import styles from './NoteNode.module.css';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { NodeErrorFallback } from '@/lib/components/NodeErrorFallback';
import * as sessionsDb from '@/lib/db/sessionsDb';
import { useToastStore } from '@/shared/stores/toastStore';

interface NoteNodeProps {
  id: string;
  data: NoteData;
  linkedConceptTitle?: string;
}

let lastDeletedNote: {
  sessionId: string;
  node: CanvasNode;
  edges: import('@/shared/types').CanvasEdge[];
  index: number;
} | null = null;

export async function undoLastDeletedNote(): Promise<boolean> {
  if (!lastDeletedNote) return false;
  const snapshot = lastDeletedNote;
  const session = await sessionsDb.getSession(snapshot.sessionId);
  if (!session || session.nodes.some((node) => node.id === snapshot.node.id)) return false;
  const nodes = [...session.nodes];
  nodes.splice(Math.min(snapshot.index, nodes.length), 0, snapshot.node);
  await useSessionStore
    .getState()
    .replaceNodes(nodes, [...(session.edges ?? []), ...snapshot.edges], snapshot.sessionId);
  lastDeletedNote = null;
  return true;
}

function NoteNodeInner({ id, data, linkedConceptTitle }: NoteNodeProps) {
  const [editing, setEditing] = useState(data.text.trim().length === 0);
  const [draft, setDraft] = useState(data.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const updateCurrent = useSessionStore((s) => s.updateCurrent);
  const replaceNodes = useSessionStore((s) => s.replaceNodes);
  const rotation = useRef<number | null>(null);
  if (rotation.current === null) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    rotation.current = (hash % 400) / 100 - 2;
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

    const updatedNodes: CanvasNode[] = authoritative.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, text: trimmed } as NoteData } : n,
    );
    await updateCurrent({ nodes: updatedNodes });
    useToastStore.getState().add('Note saved', 'success');
  }, [draft, data.text, id, updateCurrent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(false);
        setDraft(data.text);
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    },
    [data.text, handleSave],
  );

  const handleDelete = useCallback(async () => {
    const { currentId } = useSessionStore.getState();
    if (!currentId) return;
    const authoritative = await sessionsDb.getSession(currentId);
    if (!authoritative) return;

    const updatedNodes = authoritative.nodes.filter((n) => n.id !== id);
    const authEdges = authoritative.edges ?? [];
    const deletedEdges = authEdges.filter((e) => e.source === id || e.target === id);
    const updatedEdges = authEdges.filter((e) => e.source !== id && e.target !== id);
    const deletedNode = authoritative.nodes.find((node) => node.id === id);
    if (deletedNode) {
      lastDeletedNote = {
        sessionId: currentId,
        node: deletedNode,
        edges: deletedEdges,
        index: authoritative.nodes.findIndex((node) => node.id === id),
      };
    }
    await replaceNodes(updatedNodes, updatedEdges, currentId);
    useToastStore.getState().add('Note deleted', 'info', {
      label: 'Undo',
      onClick: () => {
        void undoLastDeletedNote();
      },
    });
  }, [id, updateCurrent]);

  return (
    <div
      className={styles.node}
      onDoubleClick={handleDoubleClick}
      style={{ '--note-rotate': `${rotation.current}deg` } as React.CSSProperties}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          className={styles.editInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <>
          <div className={styles.text}>{data.text || 'Empty note'}</div>
          <button className={styles.editBtn} onClick={handleDoubleClick} type="button">
            Edit
          </button>
        </>
      )}
      <button
        className={styles.deleteBtn}
        onClick={handleDelete}
        title="Delete note"
        aria-label="Delete note"
        type="button"
      >
        ×
      </button>
      {data.linkedConceptId && (
        <div className={styles.linkBadge}>
          Linked to {linkedConceptTitle ?? data.linkedConceptId}
        </div>
      )}
    </div>
  );
}

function NoteNodeWrapper(props: NoteNodeProps) {
  return (
    <ErrorBoundary name="NoteNode" fallback={<NodeErrorFallback nodeId={props.id} type="note" />}>
      <NoteNodeInner {...props} />
    </ErrorBoundary>
  );
}

export const NoteNode = memo(NoteNodeWrapper);
