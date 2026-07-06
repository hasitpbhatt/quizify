import type { LlmProvider } from '@/shared/types';
import { useSettingsStore } from '@/shared/stores/settingsStore';

export interface ProviderConfig {
  name: LlmProvider;
  label: string;
  apiBase: string;
  defaultModel: string;
  fallbackModel: string;
  gradingModel: string;
  requiresApiKey: boolean;
  apiKeyLabel: string;
  apiKeyHint: string;
  apiKeyPlaceholder: string;
  signupUrl: string;
}

export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  default: {
    name: 'default',
    label: 'Quizify (Default)',
    apiBase: '/api/chat',
    defaultModel: 'mistral-large-latest',
    fallbackModel: 'mistral-medium-latest',
    gradingModel: 'mistral-small-latest',
    requiresApiKey: false,
    apiKeyLabel: 'Quizify-managed',
    apiKeyHint: 'No key needed — proxied through Quizify (experimental, may not always work).',
    apiKeyPlaceholder: '',
    signupUrl: '',
  },
  mistral: {
    name: 'mistral',
    label: 'Mistral',
    apiBase: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-large-latest',
    fallbackModel: 'mistral-medium-latest',
    gradingModel: 'mistral-small-latest',
    requiresApiKey: true,
    apiKeyLabel: 'Mistral API key',
    apiKeyHint: 'Get a free key from console.mistral.ai',
    apiKeyPlaceholder: 'sk-…',
    signupUrl: 'https://console.mistral.ai',
  },
  nvidia: {
    name: 'nvidia',
    label: 'NVIDIA',
    apiBase: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    fallbackModel: 'meta/llama-3.3-70b-instruct',
    gradingModel: 'meta/llama-3.3-70b-instruct',
    requiresApiKey: true,
    apiKeyLabel: 'NVIDIA API key',
    apiKeyHint: 'Get a free key from build.nvidia.com',
    apiKeyPlaceholder: 'nvapi-…',
    signupUrl: 'https://build.nvidia.com',
  },
};

export function getProviderConfig(provider?: LlmProvider): ProviderConfig {
  const p = provider ?? useSettingsStore.getState().provider ?? 'mistral';
  return PROVIDERS[p];
}

export function getGradingModel(provider?: LlmProvider): string {
  return getProviderConfig(provider).gradingModel;
}

export function getApiBase(provider?: LlmProvider): string {
  return getProviderConfig(provider).apiBase;
}
