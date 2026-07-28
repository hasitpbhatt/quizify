export interface ProviderConfig {
  apiBase: string;
  defaultModel: string;
  fallbackModel: string;
  gradingModel: string;
  contentModel: string;
  quizModel: string;
  summaryModel: string;
  allowStreamingSplit: boolean;
}

export const PROVIDER: ProviderConfig = {
  apiBase: '/api/chat',
  defaultModel: 'mistral-large-latest',
  fallbackModel: 'mistral-medium-latest',
  gradingModel: 'mistral-small-latest',
  contentModel: 'mistral-medium-2508',
  quizModel: 'mistral-small-2506',
  summaryModel: 'mistral-medium-2508',
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

export const CONTENT_MODEL_CASCADE = [
  'mistral-large-latest',
  'mistral-medium-2508',
  'mistral-medium-2505',
  'mistral-small-latest',
];

export const SUMMARY_MODEL_CASCADE = [
  'mistral-large-latest',
  'mistral-medium-2508',
  'mistral-medium-2505',
  'mistral-small-latest',
];

export function getContentModelAt(index: number): string {
  return CONTENT_MODEL_CASCADE[Math.min(index, CONTENT_MODEL_CASCADE.length - 1)];
}

export function getSummaryModelAt(index: number): string {
  return SUMMARY_MODEL_CASCADE[Math.min(index, SUMMARY_MODEL_CASCADE.length - 1)];
}

export function getContentModel(): string {
  return PROVIDER.contentModel;
}

export function getQuizModel(): string {
  return PROVIDER.quizModel;
}

export function getSummaryModel(): string {
  return PROVIDER.summaryModel;
}

export function getApiBase(): string {
  return PROVIDER.apiBase;
}
