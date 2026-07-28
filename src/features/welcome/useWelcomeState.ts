import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/shared/stores/settingsStore';

export interface ExampleChip {
  label: string;
  url: string;
}

export const EXAMPLE_CHIPS: ExampleChip[] = [
  { label: 'Wikipedia: photosynthesis', url: 'https://en.wikipedia.org/wiki/Photosynthesis' },
  {
    label: 'Article: Why async/await',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function',
  },
  { label: 'Topic: agentic AI', url: 'agentic AI' },
];

export function useWelcomeState() {
  const { persona, setPersona } = useSettingsStore();
  const [url, setUrl] = useState(() => {
    try {
      return sessionStorage.getItem('quizify:draft') ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (url) sessionStorage.setItem('quizify:draft', url);
      else sessionStorage.removeItem('quizify:draft');
    } catch {
      /* storage unavailable */
    }
  }, [url]);

  const submitEnabled = url.trim().length > 0;

  const submitDisabledReason = !url.trim() ? 'Enter a URL or topic' : null;

  return {
    persona,
    url,
    setUrl,
    setPersona,
    submitEnabled,
    submitDisabledReason,
  };
}
