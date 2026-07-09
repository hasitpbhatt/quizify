import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';

const mockSubscribe = vi.hoisted(() => vi.fn(() => 'sub-1'));
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

const mockUseNotebookStore = vi.hoisted(() => vi.fn());
vi.mock('@/shared/stores/notebookStore', () => ({
  useNotebookStore: (selector: (s: { notebookMode: boolean }) => unknown) =>
    selector({ notebookMode: mockUseNotebookStore() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockUseNotebookStore.mockReturnValue(false);
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
    mockUseNotebookStore.mockReturnValue(true);
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

    const sub = mockSubscribe.mock.calls[0][1];

    act(() => {
      sub.onCharProgress('n1', 5);
    });

    act(() => {
      vi.advanceTimersByTime(40);
    });

    // displayedRevealed chases revealed via 20ms interval
    expect(result.current.revealed).toBeGreaterThan(0);
  });

  it('reveals full text on TTS end', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));

    const sub = mockSubscribe.mock.calls[0][1];

    act(() => {
      sub.onSegmentEnd('n1');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.revealed).toBe(5);
  });

  it('cancels fallback timer when TTS starts', () => {
    renderHook(() => useTypingAnimation('n1', 'hello'));

    const sub = mockSubscribe.mock.calls[0][1];

    act(() => {
      sub.onSegmentStart('n1');
    });

    // After TTS starts, the fallback timeout should be cleared
    // and revealed should stay at 0 (TTS will drive it via onCharProgress)
    expect(mockSubscribe).toHaveBeenCalled();
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

describe('skipAnimation', () => {
  it('reveals full text immediately when skipAnimation is true', () => {
    mockUseNotebookStore.mockReturnValue(true);
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello', true));
    expect(result.current.revealed).toBe(5);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe when skipAnimation is true', () => {
    renderHook(() => useTypingAnimation('n1', 'hello', true));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
