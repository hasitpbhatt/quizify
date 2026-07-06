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
    it('has defaultBearerToken', () => {
      expect(cfg.defaultBearerToken).toBe('public');
    });
    it('has OpenCode AI base URL', () => {
      expect(cfg.apiBase).toBe('https://opencode.ai/zen/v1/chat/completions');
    });
    it('has fallbackApiBase pointing to proxy', () => {
      expect(cfg.fallbackApiBase).toBe('/api/chat');
    });
    it('uses deepseek-v4-flash-free as model', () => {
      expect(cfg.defaultModel).toBe('deepseek-v4-flash-free');
    });
    it('has fallback mistral models', () => {
      expect(cfg.fallbackDefaultModel).toBe('mistral-large-latest');
      expect(cfg.fallbackFallbackModel).toBe('mistral-medium-latest');
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
    it('has no fallback fields', () => {
      expect(cfg.fallbackApiBase).toBeUndefined();
      expect(cfg.defaultBearerToken).toBeUndefined();
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
    it('has no fallback fields', () => {
      expect(cfg.fallbackApiBase).toBeUndefined();
      expect(cfg.defaultBearerToken).toBeUndefined();
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
    expect(getGradingModel('default')).toBe('deepseek-v4-flash-free');
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
    expect(getApiBase('default')).toBe('https://opencode.ai/zen/v1/chat/completions');
  });

  it('returns API base for mistral provider', () => {
    expect(getApiBase('mistral')).toBe('https://api.mistral.ai/v1/chat/completions');
  });
});
