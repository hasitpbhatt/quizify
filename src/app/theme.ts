import type { Theme } from '@/shared/types';

export function getPreferredTheme(): Theme {
  const stored = localStorage.getItem('quizify:theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'auto';
}

export function setThemeOnDocument(theme: Theme) {
  const resolved =
    theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}
