import { PROVIDERS, getProviderConfig, getGradingModel, getApiBase } from '@/lib/llm/providers';
import { useSettingsStore } from '@/shared/stores/settingsStore';

beforeEach(() => {
  useSettingsStore.setState({ provider: 'mistral' });
});

describe('PROVIDERS config', () => {
  it('has exactly 3 providers', () => {
    expect(Object.keys(PROVIDERS)).toHaveLength(3);
  });

  it('lists default, mistral, and nvidia', () => {
    expect(PROVIDERS).toHaveProperty('default');
    expect(PROVIDERS).toHaveProperty('mistral');
    expect(PROVIDERS).toHaveProperty('nvidia');
  });

  describe('default provider', () => {
    const cfg = PROVIDERS.default;
    it('has requiresApiKey: false', () => {
      expect(cfg.requiresApiKey).toBe(false);
    });
    it('uses /api/chat as the API base (Quizify-managed Mistral proxy)', () => {
      expect(cfg.apiBase).toBe('/api/chat');
    });
    it('uses mistral-large-latest as the default model', () => {
      expect(cfg.defaultModel).toBe('mistral-large-latest');
    });
    it('uses mistral-medium-latest as the fallback model', () => {
      expect(cfg.fallbackModel).toBe('mistral-medium-latest');
    });
    it('uses mistral-small-latest as the grading model', () => {
      expect(cfg.gradingModel).toBe('mistral-small-latest');
    });
  });

  describe('mistral provider', () => {
    const cfg = PROVIDERS.mistral;
    it('has requiresApiKey: true', () => {
      expect(cfg.requiresApiKey).toBe(true);
    });
    it('uses Mistral API base', () => {
      expect(cfg.apiBase).toBe('https://api.mistral.ai/v1/chat/completions');
    });
  });

  describe('nvidia provider', () => {
    const cfg = PROVIDERS.nvidia;
    it('has requiresApiKey: true', () => {
      expect(cfg.requiresApiKey).toBe(true);
    });
    it('uses NVIDIA API base', () => {
      expect(cfg.apiBase).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    });
  });
});

describe('getProviderConfig', () => {
  it('returns config for given provider', () => {
    expect(getProviderConfig('nvidia').name).toBe('nvidia');
  });

  it('returns mistral config when no provider given and store has mistral', () => {
    useSettingsStore.setState({ provider: 'mistral' });
    const cfg = getProviderConfig();
    expect(cfg.name).toBe('mistral');
  });

  it('returns default config when store has default', () => {
    useSettingsStore.setState({ provider: 'default' });
    const cfg = getProviderConfig();
    expect(cfg.name).toBe('default');
  });
});

describe('getGradingModel', () => {
  it('returns grading model for default provider', () => {
    expect(getGradingModel('default')).toBe('mistral-small-latest');
  });

  it('returns grading model for mistral provider', () => {
    expect(getGradingModel('mistral')).toBe('mistral-small-latest');
  });

  it('returns grading model for nvidia provider', () => {
    expect(getGradingModel('nvidia')).toBe('meta/llama-3.3-70b-instruct');
  });
});

describe('getApiBase', () => {
  it('returns API base for default provider', () => {
    expect(getApiBase('default')).toBe('/api/chat');
  });

  it('returns API base for mistral provider', () => {
    expect(getApiBase('mistral')).toBe('https://api.mistral.ai/v1/chat/completions');
  });
});
