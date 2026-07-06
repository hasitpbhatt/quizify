import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { ChevronDown, X } from 'lucide-react';
import styles from './Toolbar.module.css';

export function Toolbar() {
  const { sessions, currentId, load, select, remove } = useSessionStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = sessions.find((s) => s.id === currentId);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.toolbar}>
      <span className={styles.brand}>Quizify</span>

      <div className={styles.spacer} />

      <div className={styles.sessionSelect} ref={ref}>
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
          <div className={styles.dropdown} role="listbox">
            {sessions.length === 0 && (
              <div className={styles.emptyState}>No saved sessions yet</div>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`${styles.dropdownItem} ${s.id === currentId ? styles.dropdownItemActive : ''}`}
                role="option"
                aria-selected={s.id === currentId}
                onClick={() => { select(s.id); setOpen(false); }}
              >
                <span>{s.name}</span>
                <span className={styles.dropdownItemMeta}>{formatDate(s.updatedAt)}</span>
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                  aria-label={`Delete session ${s.name}`}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
