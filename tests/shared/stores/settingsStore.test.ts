import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/shared/stores/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store to defaults
    useSettingsStore.setState({
      apiKey: '',
      jinaToken: '',
      persona: null,
      theme: 'auto',
      provider: 'default',
    });
  });

  describe('initial state from localStorage', () => {
    it('loads apiKey from localStorage', async () => {
      vi.resetModules();
      localStorage.setItem('quizify:apiKey', 'test-key');
      const { useSettingsStore: reloadedStore } = await import('@/shared/stores/settingsStore');
      const { apiKey } = reloadedStore.getState();
      expect(apiKey).toBe('test-key');
    });

    it('loads provider from localStorage', async () => {
      vi.resetModules();
      localStorage.setItem('quizify:provider', 'mistral');
      const { useSettingsStore: reloadedStore } = await import('@/shared/stores/settingsStore');
      const { provider } = reloadedStore.getState();
      expect(provider).toBe('mistral');
    });
  });

  describe('setApiKey', () => {
    it('updates apiKey in store and localStorage', () => {
      useSettingsStore.getState().setApiKey('new-key');
      expect(useSettingsStore.getState().apiKey).toBe('new-key');
      expect(localStorage.getItem('quizify:apiKey')).toBe('new-key');
    });
  });

  describe('setJinaToken', () => {
    it('updates jinaToken in store and localStorage', () => {
      useSettingsStore.getState().setJinaToken('jina-token');
      expect(useSettingsStore.getState().jinaToken).toBe('jina-token');
      expect(localStorage.getItem('quizify:jinaToken')).toBe('jina-token');
    });
  });

  describe('setPersona', () => {
    it('updates persona in store and localStorage', () => {
      useSettingsStore.getState().setPersona('expert');
      expect(useSettingsStore.getState().persona).toBe('expert');
      expect(localStorage.getItem('quizify:persona')).toBe('expert');
    });
  });

  describe('setProvider', () => {
    it('updates provider in store and localStorage', () => {
      useSettingsStore.getState().setProvider('nvidia');
      expect(useSettingsStore.getState().provider).toBe('nvidia');
      expect(localStorage.getItem('quizify:provider')).toBe('nvidia');
    });
  });

  describe('hasApiKey', () => {
    it('returns false when apiKey is empty', () => {
      expect(useSettingsStore.getState().hasApiKey()).toBe(false);
    });

    it('returns true when apiKey has content', () => {
      useSettingsStore.getState().setApiKey('key');
      expect(useSettingsStore.getState().hasApiKey()).toBe(true);
    });
  });

  describe('hasPersona', () => {
    it('returns false when persona is null', () => {
      expect(useSettingsStore.getState().hasPersona()).toBe(false);
    });

    it('returns true when persona is set', () => {
      useSettingsStore.getState().setPersona('curious');
      expect(useSettingsStore.getState().hasPersona()).toBe(true);
    });
  });
});
