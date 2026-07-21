import { useEffect } from 'react';

/**
 * useKeyboardShortcuts - registers canvas-level keyboard shortcuts.
 *
 * Shortcuts:
 *   N       - call onAddNote (add sticky note at canvas center)
 *   ?       - show shortcut reference toast
 *   Escape  - call onEscape (close active modal / exit notebook mode)
 *
 * All shortcuts are suppressed when focus is inside an input/textarea/select.
 */
export function useKeyboardShortcuts(opts: {
  onAddNote?: () => void;
  onEscape?: () => void;
  onShowHelp?: () => void;
  enabled?: boolean;
}) {
  const { onAddNote, onEscape, onShowHelp, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore when focus is inside an interactive element
      const target = e.target as HTMLElement | null;
      if (!target || !target.tagName) return;

      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
        return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onAddNote?.();
      } else if (e.key === '?') {
        e.preventDefault();
        onShowHelp?.();
      } else if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onAddNote, onEscape, onShowHelp]);
}
