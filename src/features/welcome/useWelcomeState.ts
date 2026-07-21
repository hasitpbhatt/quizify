import { useState } from 'react';
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
  const [url, setUrl] = useState('');

  const submitEnabled = persona !== null && url.trim().length > 0;

  const submitDisabledReason = !persona
    ? 'Pick a profile above'
    : !url.trim()
      ? 'Enter a URL or topic'
      : null;

  return {
    persona,
    url,
    setUrl,
    setPersona,
    submitEnabled,
    submitDisabledReason,
  };
}
