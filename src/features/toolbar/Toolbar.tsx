import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { readNotebookModePreference } from '@/shared/notebookModePreference';
import { ChevronDown, X, Sun, Moon, Monitor, Plus } from 'lucide-react';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onNewSession?: () => void;
}

export function Toolbar({ onNewSession }: ToolbarProps) {
  const { sessions, currentId, load, select, remove } = useSessionStore();
  const { theme, setTheme } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
    setTheme(next);
  };
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  useEffect(() => {
    load();
  }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingDelete(null);
        setFocusIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset focus index when dropdown opens
  useEffect(() => {
    if (open) {
      const idx = sessions.findIndex(s => s.id === currentId);
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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
        setFocusIndex(prev => Math.min(prev + 1, sessions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < sessions.length) {
          select(sessions[focusIndex].id);
          setOpen(false);
          setConfirmingDelete(null);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setConfirmingDelete(null);
        break;
    }
  }, [open, focusIndex, sessions, select]);

  const current = sessions.find((s) => s.id === currentId);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const dropdownItemClass = (sId: string, i: number) => {
    return [
      styles.dropdownItem,
      sId === currentId ? styles.dropdownItemActive : '',
      i === focusIndex ? styles.dropdownItemFocused : '',
    ].filter(Boolean).join(' ');
  };

  return (
    <div className={styles.toolbar}>
      <span className={styles.brand}>Quizify</span>

      <div className={styles.spacer} />

      {onNewSession && (
        <button className={styles.newBtn} onClick={onNewSession} title="New session" type="button">
          <Plus size={16} />
          <span>New</span>
        </button>
      )}

      <button
        className={styles.themeToggle}
        onClick={cycleTheme}
        title={'Theme: ' + theme}
        type="button"
      >
        <ThemeIcon size={16} />
      </button>

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
                  setConfirmingDelete(null);
                }}
                onMouseEnter={() => setFocusIndex(i)}
              >
                <span>{s.name}</span>
                <span className={styles.dropdownItemMeta}>{formatDate(s.updatedAt)}</span>
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmingDelete === s.id) {
                      remove(s.id);
                      setConfirmingDelete(null);
                    } else {
                      setConfirmingDelete(s.id);
                    }
                  }}
                  aria-label={confirmingDelete === s.id ? 'Confirm delete ' + s.name : 'Delete session ' + s.name}
                  type="button"
                >
                  {confirmingDelete === s.id ? 'Confirm?' : <X size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
