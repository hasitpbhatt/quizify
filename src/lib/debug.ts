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
