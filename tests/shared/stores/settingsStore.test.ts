import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/shared/stores/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      persona: null,
      theme: 'auto',
    });
  });

  describe('initial state from localStorage', () => {
    it('loads persona from localStorage', async () => {
      vi.resetModules();
      localStorage.setItem('quizify:persona', 'curious');
      const { useSettingsStore: reloadedStore } = await import('@/shared/stores/settingsStore');
      const { persona } = reloadedStore.getState();
      expect(persona).toBe('curious');
    });

    it('loads theme from localStorage', async () => {
      vi.resetModules();
      localStorage.setItem('quizify:theme', 'dark');
      const { useSettingsStore: reloadedStore } = await import('@/shared/stores/settingsStore');
      const { theme } = reloadedStore.getState();
      expect(theme).toBe('dark');
    });
  });

  describe('setPersona', () => {
    it('updates persona in store and localStorage', () => {
      useSettingsStore.getState().setPersona('expert');
      expect(useSettingsStore.getState().persona).toBe('expert');
      expect(localStorage.getItem('quizify:persona')).toBe('expert');
    });
  });

  describe('setTheme', () => {
    it('updates theme in store and localStorage', () => {
      useSettingsStore.getState().setTheme('dark');
      expect(useSettingsStore.getState().theme).toBe('dark');
      expect(localStorage.getItem('quizify:theme')).toBe('dark');
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
