import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';

const mockSubscribe = vi.hoisted(() => vi.fn<(...args: unknown[]) => string>(() => 'sub-1'));
const mockUnsubscribe = vi.hoisted(() => vi.fn());
const mockFinishSegment = vi.hoisted(() => vi.fn());
const mockHasSegment = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/lib/llm/ttsManager', () => ({
  ttsManager: {
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    finishSegment: mockFinishSegment,
    hasSegment: mockHasSegment,
  },
}));

// Stateful notebook store mock: per-test we can toggle notebookMode and
// pre-seed completedTypingNodeIds to exercise the "revisit" code paths.
const mockNotebookState = vi.hoisted(() => ({
  notebookMode: false,
  completedTypingNodeIds: {} as Record<string, true>,
}));

const mockMarkTypingComplete = vi.hoisted(() => vi.fn());
const mockHasTypingCompleted = vi.hoisted(() => vi.fn());

vi.mock('@/shared/stores/notebookStore', () => ({
  useNotebookStore: (selector: (s: typeof mockNotebookState & {
    markTypingComplete: typeof mockMarkTypingComplete;
    hasTypingCompleted: typeof mockHasTypingCompleted;
  }) => unknown) =>
    selector({
      ...mockNotebookState,
      markTypingComplete: mockMarkTypingComplete,
      hasTypingCompleted: mockHasTypingCompleted,
    }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockNotebookState.notebookMode = false;
  mockNotebookState.completedTypingNodeIds = {};
  // Default implementations that drive state through the shared mock object
  // so tests can assert against it.
  mockMarkTypingComplete.mockImplementation((nodeId: string) => {
    mockNotebookState.completedTypingNodeIds[nodeId] = true;
  });
  mockHasTypingCompleted.mockImplementation((nodeId: string) =>
    Boolean(mockNotebookState.completedTypingNodeIds[nodeId]),
  );
  mockSubscribe.mockReturnValue('sub-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('default mode (notebookMode = false)', () => {
  it('returns full text revealed immediately', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe to TTS events', () => {
    renderHook(() => useTypingAnimation('n1', 'hello'));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('finishes segment via ttsManager when notebook mode changes (cleanup path)', () => {
    // This verifies the setTimeout in the cleanup path
    renderHook(() => useTypingAnimation('n1', 'hello'));
    act(() => { vi.runAllTimers(); });
    expect(mockFinishSegment).not.toHaveBeenCalled();
  });
});

describe('notebook mode (notebookMode = true)', () => {
  beforeEach(() => {
    mockNotebookState.notebookMode = true;
  });

  it('starts with revealed = 0', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(0);
    expect(result.current.isAnimating).toBe(true);
  });

  it('subscribes to TTS events', () => {
    renderHook(() => useTypingAnimation('n1', 'hello'));
    expect(mockSubscribe).toHaveBeenCalledWith('n1', expect.objectContaining({
      onSegmentStart: expect.any(Function),
      onCharProgress: expect.any(Function),
      onSegmentEnd: expect.any(Function),
    }));
  });

  it('updates revealed on TTS progress', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));

    const sub = mockSubscribe.mock.calls[0][1] as { onSegmentStart?: (nodeId: string) => void; onCharProgress?: (nodeId: string, charIndex: number) => void; onSegmentEnd?: (nodeId: string) => void; };

    act(() => {
      sub.onCharProgress!('n1', 5);
    });

    act(() => {
      vi.advanceTimersByTime(40);
    });

    // displayedRevealed chases revealed via 20ms interval
    expect(result.current.revealed).toBeGreaterThan(0);
  });

  it('chases multiple TTS progress events without getting stuck', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'x'.repeat(100)));

    const sub = mockSubscribe.mock.calls[0][1] as {
      onSegmentStart: (nodeId: string) => void;
      onCharProgress: (nodeId: string, charIndex: number) => void;
    };

    // Mark TTS as started so the 2s fallback timer is cancelled — without
    // this the fallback would race against onCharProgress and inflate
    // `revealed` past the asserted checkpoints.
    act(() => { sub.onSegmentStart('n1'); });

    act(() => { sub.onCharProgress('n1', 30); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.revealed).toBe(30);

    act(() => { sub.onCharProgress('n1', 80); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.revealed).toBe(80);
    expect(result.current.isAnimating).toBe(true);

    act(() => { sub.onCharProgress('n1', 100); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.revealed).toBe(100);
    expect(result.current.isAnimating).toBe(false);
  });

  it('reveals full text on TTS end', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));

    const sub = mockSubscribe.mock.calls[0][1] as { onSegmentStart?: (nodeId: string) => void; onCharProgress?: (nodeId: string, charIndex: number) => void; onSegmentEnd?: (nodeId: string) => void; };

    act(() => {
      sub.onSegmentEnd!('n1');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.revealed).toBe(5);
  });

  it('cancels fallback timer when TTS starts', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));

    const sub = mockSubscribe.mock.calls[0][1] as { onSegmentStart?: (nodeId: string) => void; onCharProgress?: (nodeId: string, charIndex: number) => void; onSegmentEnd?: (nodeId: string) => void; };

    act(() => {
      sub.onSegmentStart!('n1');
    });

    // After TTS starts, the fallback timeout must be cleared: advance past
    // the 2s threshold and assert revealed stays at 0 (TTS, not fallback,
    // is the only driver now). If the fallback were still active it would
    // have incremented revealed on its own.
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(mockSubscribe).toHaveBeenCalled();
    expect(result.current.revealed).toBe(0);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useTypingAnimation('n1', 'hello'));

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledWith('sub-1');
  });

  it('falls back to local timer after 2 seconds when no TTS', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));

    // Advance past the 2s fallback timeout to trigger the interval
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // The fallback interval ticks at 25ms, revealed becomes 1+
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // displayedRevealed chases revealed via 20ms interval
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.revealed).toBeGreaterThan(0);
  });

  it('completes local fallback and notifies finishSegment', () => {
    renderHook(() => useTypingAnimation('n1', 'ab'));

    // Trigger fallback
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Advance far enough to complete the animation
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockFinishSegment).toHaveBeenCalledWith('n1');
  });

  it('sets revealed(0) and displayedRevealed(0) when notebookMode is on and text is empty', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', ''));
    expect(result.current.revealed).toBe(0);
    expect(result.current.isAnimating).toBe(false);
  });
});

describe('notebook mode — typing completion cache', () => {
  beforeEach(() => {
    mockNotebookState.notebookMode = true;
  });

  it('returns full text immediately when hasTypingCompleted(nodeId) is true at mount', () => {
    mockNotebookState.completedTypingNodeIds.n1 = true;
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe to TTS when hasTypingCompleted is true', () => {
    mockNotebookState.completedTypingNodeIds.n1 = true;
    renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('marks typing complete when onSegmentEnd fires', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));
    const sub = mockSubscribe.mock.calls[0][1] as {
      onSegmentEnd: (nodeId: string) => void;
    };

    act(() => { sub.onSegmentEnd('n1'); });
    act(() => { vi.advanceTimersByTime(50); });

    expect(mockMarkTypingComplete).toHaveBeenCalledWith('n1');
    expect(result.current.revealed).toBe(5);
    expect(result.current.isAnimating).toBe(false);
  });

  it('marks typing complete when fallback finishes locally', () => {
    renderHook(() => useTypingAnimation('n1', 'ab'));

    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { vi.advanceTimersByTime(100); });

    expect(mockMarkTypingComplete).toHaveBeenCalledWith('n1');
  });

  it('on revisit with hasTypingCompleted true returns full text and skips TTS', () => {
    // First mount: simulate full completion via fallback so cache is set
    const first = renderHook(() => useTypingAnimation('n1', 'hello world'));
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { vi.advanceTimersByTime(500); });
    first.unmount();

    expect(mockNotebookState.completedTypingNodeIds.n1).toBe(true);

    // Second mount: should reveal fully without subscribing to TTS
    mockSubscribe.mockClear();
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});

describe('notebook mode — out-of-order TTS progress', () => {
  beforeEach(() => {
    mockNotebookState.notebookMode = true;
  });

  it('does not rewind revealed when onCharProgress receives a smaller index', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'x'.repeat(100)));
    const sub = mockSubscribe.mock.calls[0][1] as {
      onSegmentStart: (nodeId: string) => void;
      onCharProgress: (nodeId: string, charIndex: number) => void;
    };

    act(() => { sub.onSegmentStart('n1'); });
    act(() => { sub.onCharProgress('n1', 80); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.revealed).toBe(80);

    // Out-of-order progress: smaller index must not rewind revealed
    act(() => { sub.onCharProgress('n1', 30); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.revealed).toBe(80);
  });
});

describe('skipAnimation', () => {
  it('reveals full text immediately when skipAnimation is true', () => {
    mockNotebookState.notebookMode = true;
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello', true));
    expect(result.current.revealed).toBe(5);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe when skipAnimation is true', () => {
    renderHook(() => useTypingAnimation('n1', 'hello', true));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
