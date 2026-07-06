import { create } from 'zustand';
import type { Persona, Theme } from '@/shared/types';
import { getPreferredTheme, setThemeOnDocument } from '@/app/theme';

interface SettingsState {
  /* persisted */
  apiKey: string;
  jinaToken: string;
  persona: Persona | null;
  theme: Theme;

  /* actions */
  setApiKey: (key: string) => void;
  setJinaToken: (token: string) => void;
  setPersona: (p: Persona) => void;
  setTheme: (t: Theme) => void;

  /* derived helpers */
  hasApiKey: () => boolean;
  hasPersona: () => boolean;
}

function loadString(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveString(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* quota exceeded — silently degrade */ }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKey: loadString('quizify:apiKey'),
  jinaToken: loadString('quizify:jinaToken'),
  persona: (loadString('quizify:persona') as Persona | '') || null,
  theme: getPreferredTheme(),

  setApiKey: (apiKey) => { saveString('quizify:apiKey', apiKey); set({ apiKey }); },
  setJinaToken: (jinaToken) => { saveString('quizify:jinaToken', jinaToken); set({ jinaToken }); },
  setPersona: (persona) => { saveString('quizify:persona', persona); set({ persona }); },
  setTheme: (theme) => { saveString('quizify:theme', theme); setThemeOnDocument(theme); set({ theme }); },

  hasApiKey: () => get().apiKey.length > 0,
  hasPersona: () => get().persona !== null,
}));
