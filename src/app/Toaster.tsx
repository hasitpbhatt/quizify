import { useToastStore } from '@/shared/stores/toastStore';
import styles from './Toaster.module.css';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} data-type={t.type}>
          <span className={styles.message}>{t.message}</span>
          <button className={styles.dismiss} onClick={() => remove(t.id)} aria-label="Dismiss">
            \u2715
          </button>
        </div>
      ))}
    </div>
  );
}
