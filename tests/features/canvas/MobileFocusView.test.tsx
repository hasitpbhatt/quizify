import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MobileFocusView } from '@/features/canvas/MobileFocusView';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import type { CanvasNode } from '@/shared/types';
import * as factories from '../../shared/factories';

// Deterministic typing: always reveal the full text (no animation timing).
vi.mock('@/features/canvas/useTypingAnimation', () => ({
  useTypingAnimation: (_id: string, fullText: string) => ({
    revealed: fullText.length,
    isAnimating: false,
  }),
}));

const ttsMock = vi.hoisted(() => ({
  enqueue: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  hasSegment: vi.fn(() => false),
  isPlaying: false,
  isPaused: false,
}));
Object.defineProperty(ttsMock, 'isPlaying', { get: () => false, configurable: true });
Object.defineProperty(ttsMock, 'isPaused', { get: () => false, configurable: true });
vi.mock('@/lib/llm/ttsManager', () => ({ ttsManager: ttsMock }));

function renderMobile(nodes: CanvasNode[], notebook = true) {
  useNotebookStore.setState({ notebookMode: notebook, completedTypingNodeIds: {} });
  useSettingsStore.setState({ ttsEnabled: true });
  return render(<MobileFocusView nodes={nodes} />);
}

describe('MobileFocusView — notebook parity (NB-2)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    ttsMock.enqueue.mockClear();
    ttsMock.start.mockClear();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
    useNotebookStore.setState({ notebookMode: false, completedTypingNodeIds: {} });
  });

  function setReducedMotion(on: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: on && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  it('renders the ruled-line notebook card in notebook mode', () => {
    const concept = factories.mockConceptNode();
    const { container } = renderMobile([concept]);

    const wrapper = container.querySelector('[data-notebook="true"]') as HTMLElement;
    expect(wrapper).not.toBeNull();

    // The card element carries the module `card` class; the ruled-line paper
    // background (red margin line + horizontal rules) is applied via the
    // [data-notebook="true"] .card rule in MobileFocusView.module.css.
    const cardEl = Array.from(container.querySelectorAll('div')).find((el) =>
      el.className.includes('card'),
    ) as HTMLElement | undefined;
    expect(cardEl).toBeDefined();
    expect(cardEl!.className).toContain('card');
  });

  it('enqueues TTS narration for the active concept in notebook mode (default motion)', async () => {
    setReducedMotion(false);
    const concept = factories.mockConceptNode();
    renderMobile([concept]);

    await waitFor(() => {
      expect(ttsMock.enqueue).toHaveBeenCalledTimes(1);
    });
    expect(ttsMock.start).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-narrate under prefers-reduced-motion (matches desktop behavior)', async () => {
    setReducedMotion(true);
    const concept = factories.mockConceptNode();
    renderMobile([concept]);

    // Give effects time to run; TTS must not start under reduced motion.
    await new Promise((r) => setTimeout(r, 50));
    expect(ttsMock.enqueue).not.toHaveBeenCalled();
    expect(ttsMock.start).not.toHaveBeenCalled();
  });
});
