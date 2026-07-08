import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPreferredTheme, setThemeOnDocument } from '@/app/theme';

describe('getPreferredTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns "light" when stored value is "light"', () => {
    localStorage.setItem('quizify:theme', 'light');
    expect(getPreferredTheme()).toBe('light');
  });

  it('returns "dark" when stored value is "dark"', () => {
    localStorage.setItem('quizify:theme', 'dark');
    expect(getPreferredTheme()).toBe('dark');
  });

  it('returns "auto" when no theme is stored', () => {
    expect(getPreferredTheme()).toBe('auto');
  });

  it('returns "auto" when stored value is invalid', () => {
    localStorage.setItem('quizify:theme', 'invalid');
    expect(getPreferredTheme()).toBe('auto');
  });
});

describe('setThemeOnDocument', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('sets data-theme to "light" for light theme', () => {
    setThemeOnDocument('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme to "dark" for dark theme', () => {
    setThemeOnDocument('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves "auto" based on prefers-color-scheme match', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    setThemeOnDocument('auto');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: !query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    setThemeOnDocument('auto');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
