import { useState } from 'react';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PROVIDERS } from '@/lib/llm/providers';

export interface ExampleChip {
  label: string;
  url: string;
}

export const EXAMPLE_CHIPS: ExampleChip[] = [
  { label: 'Wikipedia: photosynthesis', url: 'https://en.wikipedia.org/wiki/Photosynthesis' },
  { label: 'Article: Why async/await', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function' },
  { label: 'Topic: agentic AI', url: 'agentic AI' },
];

export function useWelcomeState() {
  const { apiKey, persona, provider, setApiKey, setPersona, setProvider } = useSettingsStore();
  const [url, setUrl] = useState('');

  const cfg = PROVIDERS[provider];
  const keyOk = !cfg.requiresApiKey || apiKey.length > 0;
  const submitEnabled = keyOk && persona !== null && url.trim().length > 0;

  const submitDisabledReason =
    !keyOk ? `Add your ${cfg.apiKeyLabel} above` :
    !persona ? 'Pick a profile above' :
    !url.trim() ? 'Enter a URL or topic' : null;

  return {
    apiKey,
    persona,
    provider,
    url,
    setUrl,
    setApiKey,
    setPersona,
    setProvider,
    submitEnabled,
    submitDisabledReason,
  };
}
