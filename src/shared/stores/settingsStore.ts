import { create } from 'zustand';
import type { Persona, Theme } from '@/shared/types';
import { getPreferredTheme, setThemeOnDocument } from '@/app/theme';

interface SettingsState {
  persona: Persona | null;
  theme: Theme;

  setPersona: (p: Persona) => void;
  setTheme: (t: Theme) => void;

  hasPersona: () => boolean;
}

function loadString(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveString(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* quota exceeded */ }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  persona: (loadString('quizify:persona') as Persona | '') || null,
  theme: getPreferredTheme(),

  setPersona: (persona) => { saveString('quizify:persona', persona); set({ persona }); },
  setTheme: (theme) => { saveString('quizify:theme', theme); setThemeOnDocument(theme); set({ theme }); },

  hasPersona: () => get().persona !== null,
}));
