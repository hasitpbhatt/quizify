import { useState } from 'react';
import { useSettingsStore } from '@/shared/stores/settingsStore';

export interface ExampleChip {
  label: string;
  url: string;
}

export const EXAMPLE_CHIPS: ExampleChip[] = [
  { label: 'Wikipedia: photosynthesis', url: 'https://en.wikipedia.org/wiki/Photosynthesis' },
  { label: 'Article: Why async/await', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function' },
];

export function useWelcomeState() {
  const { apiKey, persona, setApiKey, setPersona } = useSettingsStore();
  const [url, setUrl] = useState('');

  const submitEnabled = apiKey.length > 0 && persona !== null && url.trim().length > 0;

  const submitDisabledReason =
    !apiKey ? 'Add your Mistral API key above' :
    !persona ? 'Pick a profile above' :
    !url.trim() ? 'Paste a URL' : null;

  return {
    apiKey,
    persona,
    url,
    setUrl,
    setApiKey,
    setPersona,
    submitEnabled,
    submitDisabledReason,
  };
}
