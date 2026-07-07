import { vi } from 'vitest';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Polyfill browser APIs required by @xyflow/react and roughjs

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock crypto.randomUUID for environments that don't have it
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` },
    writable: true,
  });
}

// requestAnimationFrame — React Flow uses it for internal scheduling
let rafId = 0;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  rafId++;
  setTimeout(() => cb(Date.now()), 0);
  return rafId;
};
globalThis.cancelAnimationFrame = (id: number) => { /* no-op */ };

// ResizeObserver — React Flow observes its container for layout
class ResizeObserverMock {
  observe() { /* no-op */ }
  unobserve() { /* no-op */ }
  disconnect() { /* no-op */ }
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

// IntersectionObserver — MiniMap uses it internally
class IntersectionObserverMock {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe() { /* no-op */ }
  unobserve() { /* no-op */ }
  disconnect() { /* no-op */ }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverMock as unknown as typeof IntersectionObserver,
});

// speechSynthesis — ConceptNode cleanup calls window.speechSynthesis.cancel()
Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: { cancel: vi.fn(), speak: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: vi.fn().mockReturnValue([]), speaking: false, pending: false, paused: false },
});

// URL.createObjectURL / revokeObjectURL — ConceptNode uses them for TTS
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
  globalThis.URL.revokeObjectURL = vi.fn();
}
