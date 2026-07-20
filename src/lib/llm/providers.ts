export interface ProviderConfig {
  apiBase: string;
  defaultModel: string;
  fallbackModel: string;
  gradingModel: string;
  contentModel: string;
  allowStreamingSplit: boolean;
}

export const PROVIDER: ProviderConfig = {
  apiBase: '/api/chat',
  defaultModel: 'mistral-large-latest',
  fallbackModel: 'mistral-medium-latest',
  gradingModel: 'mistral-small-latest',
  contentModel: 'mistral-medium-2508',
  allowStreamingSplit: true,
};

export function getDefaultModel(): string {
  return PROVIDER.defaultModel;
}

export function getFallbackModel(): string {
  return PROVIDER.fallbackModel;
}

export function getGradingModel(): string {
  return PROVIDER.gradingModel;
}

export function getContentModel(): string {
  return PROVIDER.contentModel;
}

export function getApiBase(): string {
  return PROVIDER.apiBase;
}
