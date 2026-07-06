import { create } from 'zustand';
import type { LlmProvider, Persona, Theme } from '@/shared/types';
import { getPreferredTheme, setThemeOnDocument } from '@/app/theme';

interface SettingsState {
  /* persisted */
  apiKey: string;
  jinaToken: string;
  persona: Persona | null;
  theme: Theme;
  provider: LlmProvider;

  /* actions */
  setApiKey: (key: string) => void;
  setJinaToken: (token: string) => void;
  setPersona: (p: Persona) => void;
  setTheme: (t: Theme) => void;
  setProvider: (p: LlmProvider) => void;

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
  provider: (loadString('quizify:provider') as LlmProvider) || 'default',

  setApiKey: (apiKey) => { saveString('quizify:apiKey', apiKey); set({ apiKey }); },
  setJinaToken: (jinaToken) => { saveString('quizify:jinaToken', jinaToken); set({ jinaToken }); },
  setPersona: (persona) => { saveString('quizify:persona', persona); set({ persona }); },
  setTheme: (theme) => { saveString('quizify:theme', theme); setThemeOnDocument(theme); set({ theme }); },
  setProvider: (provider) => { saveString('quizify:provider', provider); set({ provider }); },

  hasApiKey: () => get().apiKey.length > 0,
  hasPersona: () => get().persona !== null,
}));
