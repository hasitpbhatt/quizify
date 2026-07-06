import type { LlmProvider } from '@/shared/types';
import { useSettingsStore } from '@/shared/stores/settingsStore';

const OPENCODE_BASE = 'https://opencode.ai/zen/v1/chat/completions';
const OPENCODE_MODEL = 'deepseek-v4-flash-free';

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
  defaultBearerToken?: string;
  fallbackApiBase?: string;
  fallbackDefaultModel?: string;
  fallbackFallbackModel?: string;
}

export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  default: {
    name: 'default',
    label: 'Quizify (Default)',
    apiBase: OPENCODE_BASE,
    defaultModel: OPENCODE_MODEL,
    fallbackModel: OPENCODE_MODEL,
    gradingModel: OPENCODE_MODEL,
    requiresApiKey: false,
    defaultBearerToken: 'public',
    apiKeyLabel: 'Quizify-managed',
    apiKeyHint: 'No key needed — multi-layered fallback (OpenCode → Mistral).',
    apiKeyPlaceholder: '',
    signupUrl: '',
    fallbackApiBase: '/api/chat',
    fallbackDefaultModel: 'mistral-large-latest',
    fallbackFallbackModel: 'mistral-medium-latest',
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
