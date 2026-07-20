import { PROVIDER, getGradingModel, getApiBase, getDefaultModel, getFallbackModel, getContentModel } from '@/lib/llm/providers';

describe('PROVIDER config', () => {
  it('apiBase is /api/chat', () => {
    expect(PROVIDER.apiBase).toBe('/api/chat');
  });

  it('defaultModel is mistral-large-latest', () => {
    expect(PROVIDER.defaultModel).toBe('mistral-large-latest');
  });

  it('fallbackModel is mistral-medium-latest', () => {
    expect(PROVIDER.fallbackModel).toBe('mistral-medium-latest');
  });

  it('gradingModel is mistral-small-latest', () => {
    expect(PROVIDER.gradingModel).toBe('mistral-small-latest');
  });

  it('contentModel is mistral-medium-2508', () => {
    expect(PROVIDER.contentModel).toBe('mistral-medium-2508');
  });

  it('allowStreamingSplit is true', () => {
    expect(PROVIDER.allowStreamingSplit).toBe(true);
  });
});

describe('helper functions', () => {
  it('getDefaultModel returns PROVIDER.defaultModel', () => {
    expect(getDefaultModel()).toBe(PROVIDER.defaultModel);
  });

  it('getFallbackModel returns PROVIDER.fallbackModel', () => {
    expect(getFallbackModel()).toBe(PROVIDER.fallbackModel);
  });

  it('getGradingModel returns PROVIDER.gradingModel', () => {
    expect(getGradingModel()).toBe(PROVIDER.gradingModel);
  });

  it('getContentModel returns PROVIDER.contentModel', () => {
    expect(getContentModel()).toBe(PROVIDER.contentModel);
  });

  it('getApiBase returns PROVIDER.apiBase', () => {
    expect(getApiBase()).toBe(PROVIDER.apiBase);
  });
});
