import { create } from 'zustand';
import type { Persona, Theme } from '@/shared/types';
import { getPreferredTheme, setThemeOnDocument } from '@/app/theme';

interface SettingsState {
  persona: Persona | null;
  theme: Theme;
  /** Whether Notebook auto-narration should play audio. Default on. */
  ttsEnabled: boolean;
  /** Speech rate for narration (0.5–2). Default 1. */
  ttsRate: number;

  setPersona: (p: Persona) => void;
  setTheme: (t: Theme) => void;
  setTtsEnabled: (on: boolean) => void;
  setTtsRate: (rate: number) => void;

  hasPersona: () => boolean;
}

function loadString(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function saveString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota exceeded */
  }
}
function loadBool(key: string, fallback: boolean): boolean {
  const v = loadString(key);
  if (v === '') return fallback;
  return v === 'true';
}
function loadNumber(key: string, fallback: number): number {
  const v = loadString(key);
  if (v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  persona: (loadString('quizify:persona') as Persona | '') || null,
  theme: getPreferredTheme(),
  ttsEnabled: loadBool('quizify:ttsEnabled', true),
  ttsRate: loadNumber('quizify:ttsRate', 1),

  setPersona: (persona) => {
    saveString('quizify:persona', persona);
    set({ persona });
  },
  setTheme: (theme) => {
    saveString('quizify:theme', theme);
    setThemeOnDocument(theme);
    set({ theme });
  },
  setTtsEnabled: (on) => {
    saveString('quizify:ttsEnabled', String(on));
    set({ ttsEnabled: on });
  },
  setTtsRate: (rate) => {
    saveString('quizify:ttsRate', String(rate));
    set({ ttsRate: rate });
  },

  hasPersona: () => get().persona !== null,
}));
