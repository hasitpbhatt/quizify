import type { LlmProvider } from '@/shared/types';
import { useSettingsStore } from '@/shared/stores/settingsStore';

export interface ProviderConfig {
  name: LlmProvider;
  label: string;
  apiBase: string;
  defaultModel: string;
  fallbackModel: string;
  gradingModel: string;
  contentModel: string;
  requiresApiKey: boolean;
  apiKeyLabel: string;
  apiKeyHint: string;
  apiKeyPlaceholder: string;
  signupUrl: string;
  rpm: number;
  allowStreamingSplit: boolean;
}

export function isLowRpmProvider(provider?: LlmProvider): boolean {
  const p = provider ?? useSettingsStore.getState().provider ?? 'mistral';
  const cfg = PROVIDERS[p];
  return cfg.rpm <= 10;
}

export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  default: {
    name: 'default',
    label: 'Quizify (Default)',
    apiBase: '/api/chat',
    defaultModel: 'mistral-large-latest',
    fallbackModel: 'mistral-medium-latest',
    gradingModel: 'mistral-small-latest',
    contentModel: 'mistral-medium-2508',
    requiresApiKey: false,
    apiKeyLabel: 'Quizify-managed',
    apiKeyHint: 'No key needed — routed through the Quizify-managed Mistral proxy. May be unavailable if the server key is not configured.',
    apiKeyPlaceholder: '',
    signupUrl: '',
    rpm: 30,
    allowStreamingSplit: true,
  },
  mistral: {
    name: 'mistral',
    label: 'Mistral',
    apiBase: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-large-latest',
    fallbackModel: 'mistral-medium-latest',
    gradingModel: 'mistral-small-latest',
    contentModel: 'mistral-medium-2508',
    requiresApiKey: true,
    apiKeyLabel: 'Mistral API key',
    apiKeyHint: 'Get a free key from console.mistral.ai',
    apiKeyPlaceholder: 'sk-…',
    signupUrl: 'https://console.mistral.ai',
    rpm: 5,
    allowStreamingSplit: false,
  },
  nvidia: {
    name: 'nvidia',
    label: 'NVIDIA',
    apiBase: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b',
    fallbackModel: 'meta/llama-3.3-70b-instruct',
    gradingModel: 'meta/llama-3.3-70b-instruct',
    contentModel: 'meta/llama-3.3-70b-instruct',
    requiresApiKey: true,
    apiKeyLabel: 'NVIDIA API key',
    apiKeyHint: 'Get a free key from build.nvidia.com',
    apiKeyPlaceholder: 'nvapi-…',
    signupUrl: 'https://build.nvidia.com',
    rpm: 30,
    allowStreamingSplit: true,
  },
};

export function getProviderConfig(provider?: LlmProvider): ProviderConfig {
  const p = provider ?? useSettingsStore.getState().provider ?? 'mistral';
  return PROVIDERS[p];
}

export function getGradingModel(provider?: LlmProvider): string {
  return getProviderConfig(provider).gradingModel;
}

export function getContentModel(provider?: LlmProvider): string {
  return getProviderConfig(provider).contentModel;
}

export function getApiBase(provider?: LlmProvider): string {
  return getProviderConfig(provider).apiBase;
}
