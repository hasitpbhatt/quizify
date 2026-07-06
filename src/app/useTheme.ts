import { useEffect } from 'react';
import { getPreferredTheme, setThemeOnDocument } from './theme';

export function useTheme() {
  useEffect(() => {
    const theme = getPreferredTheme();
    setThemeOnDocument(theme);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = getPreferredTheme();
      if (current === 'auto') setThemeOnDocument('auto');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
}
