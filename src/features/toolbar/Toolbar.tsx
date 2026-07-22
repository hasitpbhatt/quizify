import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { readNotebookModePreference } from '@/shared/notebookModePreference';
import { BookOpen, ChevronDown, X } from 'lucide-react';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  canvasPage?: boolean;
}

export function Toolbar({ canvasPage }: ToolbarProps) {
  const { sessions, currentId, load, select, remove } = useSessionStore();
  const [open, setOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  // Close dropdown on outside click
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

  // Reset focus index when dropdown opens
  useEffect(() => {
    if (open) {
      const idx = sessions.findIndex((s) => s.id === currentId);
      setFocusIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusIndex(-1);
    }
  }, [open, currentId, sessions]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex < 0 || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('[role="option"]');
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
            select(sessions[focusIndex].id);
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

  const dropdownItemClass = (sId: string, i: number) => {
    return [
      styles.dropdownItem,
      sId === currentId ? styles.dropdownItemActive : '',
      i === focusIndex ? styles.dropdownItemFocused : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

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

      {canvasPage && (
        <button
          className={styles.notebookToggle}
          onClick={useNotebookStore.getState().toggleNotebookMode}
          title="Switch to notebook reading mode"
          type="button"
        >
          <BookOpen size={14} />
        </button>
      )}

      <div className={styles.sessionSelect} ref={ref} onKeyDown={handleKeyDown}>
        <button
          className={styles.sessionTrigger}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={styles.sessionName}>
            {current ? current.name : 'No session selected'}
          </span>
          <ChevronDown size={14} />
        </button>

        {open && (
          <div className={styles.dropdown} role="listbox" ref={dropdownRef}>
            {sessions.length === 0 && (
              <div className={styles.emptyState}>No saved sessions yet</div>
            )}
            {sessions.map((s, i) => (
              <div
                key={s.id}
                className={dropdownItemClass(s.id, i)}
                role="option"
                aria-selected={s.id === currentId}
                onClick={() => {
                  useNotebookStore.getState().setNotebookMode(readNotebookModePreference(s.id));
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
                  aria-label={'Delete session ' + s.name}
                  title="Delete session"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className={styles.localNote}>
              Sessions are stored locally in this browser (IndexedDB).
            </div>
          </div>
        )}
      </div>

      {deleteCandidate &&
        (() => {
          const sessionToDelete = sessions.find((s) => s.id === deleteCandidate);
          return (
            <div className={styles.dialogOverlay} onClick={() => setDeleteCandidate(null)}>
              <div
                className={styles.dialogModal}
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="toolbar-delete-title"
                aria-describedby="toolbar-delete-desc"
              >
                <h2 id="toolbar-delete-title" className={styles.dialogTitle}>
                  Delete Session
                </h2>
                <p id="toolbar-delete-desc" className={styles.dialogDesc}>
                  Are you sure you want to delete the session "
                  {sessionToDelete?.name || 'this session'}"? This action cannot be undone.
                </p>
                <div className={styles.dialogButtons}>
                  <button
                    className={styles.dialogCancelBtn}
                    onClick={() => setDeleteCandidate(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.dialogConfirmBtn}
                    onClick={() => {
                      if (deleteCandidate) {
                        remove(deleteCandidate);
                        setDeleteCandidate(null);
                        setOpen(false);
                      }
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
