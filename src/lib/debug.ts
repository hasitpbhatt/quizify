export function isDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  const fromUrl = new URLSearchParams(window.location.search).get('debug');
  if (fromUrl === '1') return true;
  try {
    return localStorage.getItem('quizify:debug') === '1';
  } catch {
    return false;
  }
}

export function debugLog(
  level: 'log' | 'warn' | 'error',
  tag: string,
  message: string,
  ...args: unknown[]
): void {
  if (!isDebugMode()) return;
  const fn = console[level] ?? console.log;
  if (args.length) fn(`[debug][${tag}] ${message}`, ...args);
  else fn(`[debug][${tag}] ${message}`);
}

export function setDebugMode(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem('quizify:debug', '1');
    } else {
      localStorage.removeItem('quizify:debug');
    }
  } catch {
    /* silently degrade */
  }
}
