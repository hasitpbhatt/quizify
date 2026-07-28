import { useEffect, useRef, type ReactNode } from 'react';

interface AccessibleDialogProps {
  role?: 'dialog' | 'alertdialog';
  labelledBy?: string;
  describedBy?: string;
  label?: string;
  onClose: () => void;
  initialFocusSelector?: string;
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
}

export function AccessibleDialog({
  role = 'dialog',
  labelledBy,
  describedBy,
  label,
  onClose,
  initialFocusSelector,
  children,
  overlayClassName,
  panelClassName,
}: AccessibleDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;

    const panel = panelRef.current;
    if (!panel) return;

    const focusTarget = initialFocusSelector
      ? panel.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusTarget ?? focusable[0])?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [initialFocusSelector, onClose]);

  return (
    <div className={overlayClassName} onClick={onClose}>
      <div
        ref={panelRef}
        className={panelClassName}
        onClick={(event) => event.stopPropagation()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
