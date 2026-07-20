const NOTEBOOK_MODE_PREFIX = 'quizify:notebookMode:';

function storageKey(sessionId: string): string {
  return `${NOTEBOOK_MODE_PREFIX}${sessionId}`;
}

export function readNotebookModePreference(sessionId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(storageKey(sessionId)) !== 'graph';
  } catch {
    return true;
  }
}

export function writeNotebookModePreference(sessionId: string, notebookMode: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(sessionId), notebookMode ? 'notebook' : 'graph');
  } catch {
    // Session storage can be unavailable in private or constrained browsing modes.
  }
}
