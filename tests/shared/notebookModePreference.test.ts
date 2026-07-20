import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readNotebookModePreference, writeNotebookModePreference } from '@/shared/notebookModePreference';

const SESSION_ID = 'session-1';
const ANOTHER_SESSION = 'session-2';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('readNotebookModePreference', () => {
  it('returns true (notebook) when nothing is stored', () => {
    expect(readNotebookModePreference(SESSION_ID)).toBe(true);
  });

  it('returns false when "graph" is stored', () => {
    window.sessionStorage.setItem('quizify:notebookMode:' + SESSION_ID, 'graph');
    expect(readNotebookModePreference(SESSION_ID)).toBe(false);
  });

  it('returns true when "notebook" is stored', () => {
    window.sessionStorage.setItem('quizify:notebookMode:' + SESSION_ID, 'notebook');
    expect(readNotebookModePreference(SESSION_ID)).toBe(true);
  });

  it('treats unknown values as notebook (default)', () => {
    window.sessionStorage.setItem('quizify:notebookMode:' + SESSION_ID, 'something-else');
    expect(readNotebookModePreference(SESSION_ID)).toBe(true);
  });

  it('is isolated per session ID', () => {
    window.sessionStorage.setItem('quizify:notebookMode:' + SESSION_ID, 'graph');
    window.sessionStorage.setItem('quizify:notebookMode:' + ANOTHER_SESSION, 'notebook');
    expect(readNotebookModePreference(SESSION_ID)).toBe(false);
    expect(readNotebookModePreference(ANOTHER_SESSION)).toBe(true);
  });

  it('is safe when sessionStorage.getItem throws', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(() => readNotebookModePreference(SESSION_ID)).not.toThrow();
    expect(readNotebookModePreference(SESSION_ID)).toBe(true);
  });
});

describe('writeNotebookModePreference', () => {
  it('writes "notebook" for true', () => {
    writeNotebookModePreference(SESSION_ID, true);
    expect(window.sessionStorage.getItem('quizify:notebookMode:' + SESSION_ID)).toBe('notebook');
  });

  it('writes "graph" for false', () => {
    writeNotebookModePreference(SESSION_ID, false);
    expect(window.sessionStorage.getItem('quizify:notebookMode:' + SESSION_ID)).toBe('graph');
  });

  it('round-trips: write false then read returns false', () => {
    writeNotebookModePreference(SESSION_ID, false);
    expect(readNotebookModePreference(SESSION_ID)).toBe(false);
  });

  it('round-trips: write true then read returns true', () => {
    writeNotebookModePreference(SESSION_ID, true);
    expect(readNotebookModePreference(SESSION_ID)).toBe(true);
  });

  it('is isolated per session ID', () => {
    writeNotebookModePreference(SESSION_ID, false);
    writeNotebookModePreference(ANOTHER_SESSION, true);
    expect(readNotebookModePreference(SESSION_ID)).toBe(false);
    expect(readNotebookModePreference(ANOTHER_SESSION)).toBe(true);
  });

  it('is safe when sessionStorage.setItem throws', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(() => writeNotebookModePreference(SESSION_ID, false)).not.toThrow();
  });
});
