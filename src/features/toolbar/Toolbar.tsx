import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';

import { AccessibleDialog } from '@/lib/components/AccessibleDialog';
import { ChevronDown, X } from 'lucide-react';
import styles from './Toolbar.module.css';

export function Toolbar() {
  const { sessions, currentId, load, select, remove, updateCurrent } = useSessionStore();
  const [open, setOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDeleteCandidate(null);
        setFocusIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = sessions.findIndex((s) => s.id === currentId);
      setFocusIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusIndex(-1);
    }
  }, [open, currentId, sessions]);

  useEffect(() => {
    if (focusIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('[data-session-item]');
    const target = items[focusIndex] as HTMLElement | undefined;
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [focusIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((prev) => Math.min(prev + 1, sessions.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < sessions.length) {
            const session = sessions[focusIndex];
            useNotebookStore.getState().setNotebookMode(true);
            select(session.id);
            setOpen(false);
            setDeleteCandidate(null);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (deleteCandidate) {
            setDeleteCandidate(null);
            break;
          }
          setOpen(false);
          break;
      }
    },
    [open, focusIndex, sessions, select],
  );

  const current = sessions.find((s) => s.id === currentId);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const startRename = () => {
    if (!current) return;
    setRenameValue(current.name);
    setRenaming(true);
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (!current || !trimmed || trimmed === current.name) return;
    await updateCurrent({ name: trimmed });
  };

  const sessionToDelete = deleteCandidate
    ? sessions.find((s) => s.id === deleteCandidate)
    : undefined;

  return (
    <div className={styles.toolbar}>
      <span className={styles.brand}>
        Quizify
        <a
          className={styles.byline}
          href="https://hasit.in"
          target="_blank"
          rel="noopener noreferrer"
        >
          by hasit.in
        </a>
      </span>

      <div className={styles.spacer} />

      <div className={styles.sessionSelect} ref={ref} onKeyDown={handleKeyDown}>
        <button
          className={styles.sessionTrigger}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Sessions"
          type="button"
        >
          <span className={styles.sessionName}>
            {current ? current.name : 'No session selected'}
          </span>
          <ChevronDown size={14} aria-hidden />
        </button>

        {open && (
          <div className={styles.dropdown} role="menu" ref={dropdownRef}>
            {sessions.length === 0 && (
              <div className={styles.emptyState}>No saved sessions yet</div>
            )}
            {sessions.map((s, i) => (
              <div
                key={s.id}
                className={[
                  styles.dropdownItem,
                  s.id === currentId ? styles.dropdownItemActive : '',
                  i === focusIndex ? styles.dropdownItemFocused : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-session-item
                role="menuitem"
                tabIndex={i === focusIndex ? 0 : -1}
                onClick={() => {
                  useNotebookStore.getState().setNotebookMode(true);
                  select(s.id);
                  setOpen(false);
                  setDeleteCandidate(null);
                }}
                onMouseEnter={() => setFocusIndex(i)}
              >
                <span>{s.name}</span>
                <span className={styles.dropdownItemMeta}>{formatDate(s.updatedAt)}</span>
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteCandidate(s.id);
                  }}
                  aria-label={`Delete session ${s.name}`}
                  title="Delete session"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {current && (
              <button className={styles.renameBtn} onClick={startRename} type="button">
                Rename current session
              </button>
            )}
            <div className={styles.localNote}>
              Sessions are stored locally in this browser (IndexedDB).
            </div>
          </div>
        )}
      </div>

      {renaming && (
        <AccessibleDialog
          role="dialog"
          label="Rename session"
          onClose={() => setRenaming(false)}
          overlayClassName={styles.dialogOverlay}
          panelClassName={styles.dialogModal}
          initialFocusSelector="#rename-session-input"
        >
          <h2 className={styles.dialogTitle}>Rename session</h2>
          <input
            id="rename-session-input"
            className={styles.renameInput}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
            }}
          />
          <div className={styles.dialogButtons}>
            <button
              className={styles.dialogCancelBtn}
              onClick={() => setRenaming(false)}
              type="button"
            >
              Cancel
            </button>
            <button className={styles.dialogConfirmBtn} onClick={commitRename} type="button">
              Save
            </button>
          </div>
        </AccessibleDialog>
      )}

      {deleteCandidate && sessionToDelete && (
        <AccessibleDialog
          role="alertdialog"
          labelledBy="toolbar-delete-title"
          describedBy="toolbar-delete-desc"
          onClose={() => setDeleteCandidate(null)}
          overlayClassName={styles.dialogOverlay}
          panelClassName={styles.dialogModal}
          initialFocusSelector=".toolbar-delete-cancel"
        >
          <h2 id="toolbar-delete-title" className={styles.dialogTitle}>
            Delete Session
          </h2>
          <p id="toolbar-delete-desc" className={styles.dialogDesc}>
            Are you sure you want to delete the session "{sessionToDelete.name}"? This action cannot
            be undone.
          </p>
          <div className={styles.dialogButtons}>
            <button
              className={`${styles.dialogCancelBtn} toolbar-delete-cancel`}
              onClick={() => setDeleteCandidate(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dialogConfirmBtn}
              onClick={() => {
                remove(deleteCandidate);
                setDeleteCandidate(null);
                setOpen(false);
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        </AccessibleDialog>
      )}
    </div>
  );
}
