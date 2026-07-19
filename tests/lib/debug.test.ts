import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isDebugMode, setDebugMode } from '@/lib/debug';

describe('debug', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { search: '' } });
    try { localStorage.removeItem('quizify:debug'); } catch { /* noop */ }
  });

  it('returns false when no debug flag is present', () => {
    expect(isDebugMode()).toBe(false);
  });

  it('returns true when ?debug=1 is in the URL', () => {
    vi.stubGlobal('window', { location: { search: '?debug=1' } });
    expect(isDebugMode()).toBe(true);
  });

  it('returns false for other debug URL values', () => {
    vi.stubGlobal('window', { location: { search: '?debug=0' } });
    expect(isDebugMode()).toBe(false);
  });

  it('returns true when localStorage quizify:debug is 1', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    localStorage.setItem('quizify:debug', '1');
    expect(isDebugMode()).toBe(true);
  });

  it('setDebugMode(true) persists to localStorage', () => {
    setDebugMode(true);
    expect(localStorage.getItem('quizify:debug')).toBe('1');
  });

  it('setDebugMode(false) removes from localStorage', () => {
    localStorage.setItem('quizify:debug', '1');
    setDebugMode(false);
    expect(localStorage.getItem('quizify:debug')).toBeNull();
  });
});
