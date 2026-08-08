import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypingAnimation } from '@/features/canvas/useTypingAnimation';

const mockTts = vi.hoisted(() => {
  const state = { isPlaying: false, currentSegmentId: null as string | null };
  return {
    state,
    subscribe: vi.fn<(...args: unknown[]) => string>(() => 'sub-1'),
    unsubscribe: vi.fn(),
    finishSegment: vi.fn(),
    hasSegment: vi.fn(() => false),
    emitCharProgress: vi.fn(),
    get isPlaying() {
      return state.isPlaying;
    },
    get currentSegmentId() {
      return state.currentSegmentId;
    },
  };
});

vi.mock('@/lib/llm/ttsManager', () => ({
  ttsManager: mockTts,
}));

const mockNotebookState = vi.hoisted(() => ({
  notebookMode: false,
  completedTypingNodeIds: {} as Record<string, true>,
}));

const mockMarkTypingComplete = vi.hoisted(() => vi.fn());
const mockHasTypingCompleted = vi.hoisted(() => vi.fn());
const mockResetTypingForSession = vi.hoisted(() => vi.fn());

vi.mock('@/shared/stores/notebookStore', () => ({
  useNotebookStore: (
    selector: (
      s: typeof mockNotebookState & {
        markTypingComplete: typeof mockMarkTypingComplete;
        hasTypingCompleted: typeof mockHasTypingCompleted;
        resetTypingForSession: typeof mockResetTypingForSession;
      },
    ) => unknown,
  ) =>
    selector({
      ...mockNotebookState,
      markTypingComplete: mockMarkTypingComplete,
      hasTypingCompleted: mockHasTypingCompleted,
      resetTypingForSession: mockResetTypingForSession,
    }),
}));

const mockSettingsState = vi.hoisted(() => ({ ttsEnabled: false }));

vi.mock('@/shared/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { ttsEnabled: boolean }) => unknown) =>
    selector(mockSettingsState),
}));

interface TypingSub {
  onSegmentStart?: (nodeId: string) => void;
  onCharProgress?: (nodeId: string, charIndex: number) => void;
  onSegmentEnd?: (nodeId: string) => void;
}

function getSub(): TypingSub {
  return mockTts.subscribe.mock.calls[0][1] as TypingSub;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockNotebookState.notebookMode = false;
  mockNotebookState.completedTypingNodeIds = {};
  mockSettingsState.ttsEnabled = false;
  mockTts.state.isPlaying = false;
  mockTts.state.currentSegmentId = null;
  mockMarkTypingComplete.mockImplementation((nodeId: string) => {
    mockNotebookState.completedTypingNodeIds[nodeId] = true;
  });
  mockHasTypingCompleted.mockImplementation((nodeId: string) =>
    Boolean(mockNotebookState.completedTypingNodeIds[nodeId]),
  );
  mockTts.subscribe.mockReturnValue('sub-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TTS disabled (ttsEnabled = false)', () => {
  it('returns full text revealed immediately', () => {
    mockNotebookState.notebookMode = true;
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe to TTS events', () => {
    mockNotebookState.notebookMode = true;
    renderHook(() => useTypingAnimation('n1', 'hello'));
    expect(mockTts.subscribe).not.toHaveBeenCalled();
  });
});

describe('notebook mode + TTS enabled', () => {
  beforeEach(() => {
    mockNotebookState.notebookMode = true;
    mockSettingsState.ttsEnabled = true;
  });

  it('starts with revealed = 0 and isAnimating = true', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(0);
    expect(result.current.isAnimating).toBe(true);
  });

  it('subscribes to TTS events for the node', () => {
    renderHook(() => useTypingAnimation('n1', 'hello'));
    expect(mockTts.subscribe).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({
        onSegmentStart: expect.any(Function),
        onCharProgress: expect.any(Function),
        onSegmentEnd: expect.any(Function),
      }),
    );
  });

  it('reveals text in sync with onCharProgress (50ms chase per char)', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'x'.repeat(100)));
    const sub = getSub();

    act(() => {
      sub.onCharProgress!('n1', 30);
    });
    act(() => {
      vi.advanceTimersByTime(50 * 30);
    });
    expect(result.current.revealed).toBe(30);

    act(() => {
      sub.onCharProgress!('n1', 80);
    });
    act(() => {
      vi.advanceTimersByTime(50 * 50);
    });
    expect(result.current.revealed).toBe(80);
    expect(result.current.isAnimating).toBe(true);
  });

  it('does not rewind revealed when onCharProgress receives a smaller index', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'x'.repeat(100)));
    const sub = getSub();

    act(() => {
      sub.onCharProgress!('n1', 80);
    });
    act(() => {
      vi.advanceTimersByTime(50 * 80);
    });
    expect(result.current.revealed).toBe(80);

    act(() => {
      sub.onCharProgress!('n1', 30);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.revealed).toBe(80);
  });

  it('reveals full text and marks complete on onSegmentEnd', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));
    const sub = getSub();

    act(() => {
      sub.onSegmentEnd!('n1');
    });

    expect(result.current.revealed).toBe(5);
    expect(result.current.isAnimating).toBe(false);
    expect(mockMarkTypingComplete).toHaveBeenCalledWith('n1');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useTypingAnimation('n1', 'hello'));
    unmount();
    expect(mockTts.unsubscribe).toHaveBeenCalledWith('sub-1');
  });

  it('skip reveals full text, marks complete, and finishes the segment', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello'));

    act(() => {
      result.current.skipAnimation();
    });

    expect(result.current.revealed).toBe(5);
    expect(result.current.isAnimating).toBe(false);
    expect(mockMarkTypingComplete).toHaveBeenCalledWith('n1');
    expect(mockTts.finishSegment).toHaveBeenCalledWith('n1');
  });

  it('does not animate empty text', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', ''));
    expect(result.current.revealed).toBe(0);
    expect(result.current.isAnimating).toBe(false);
    expect(mockTts.subscribe).not.toHaveBeenCalled();
  });

  it('safety timeout reveals text when narration never started', () => {
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
    expect(mockMarkTypingComplete).toHaveBeenCalledWith('n1');
  });

  it('safety timeout does not cut off an actively narrating segment', () => {
    mockTts.state.isPlaying = true;
    mockTts.state.currentSegmentId = 'n1';
    const { result } = renderHook(() => useTypingAnimation('n1', 'x'.repeat(200)));
    const sub = getSub();

    act(() => {
      sub.onCharProgress!('n1', 40);
    });
    act(() => {
      vi.advanceTimersByTime(50 * 40);
    });
    expect(result.current.revealed).toBe(40);

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(result.current.revealed).toBe(40);
    expect(result.current.isAnimating).toBe(true);
    expect(mockMarkTypingComplete).not.toHaveBeenCalled();

    act(() => {
      sub.onSegmentEnd!('n1');
    });
    expect(result.current.revealed).toBe(200);
    expect(mockMarkTypingComplete).toHaveBeenCalledWith('n1');
  });
});

describe('typing completion cache', () => {
  beforeEach(() => {
    mockNotebookState.notebookMode = true;
    mockSettingsState.ttsEnabled = true;
  });

  it('returns full text immediately when typing already completed', () => {
    mockNotebookState.completedTypingNodeIds.n1 = true;
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe to TTS when typing already completed', () => {
    mockNotebookState.completedTypingNodeIds.n1 = true;
    renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(mockTts.subscribe).not.toHaveBeenCalled();
  });

  it('on revisit after completion reveals fully and skips TTS', () => {
    const first = renderHook(() => useTypingAnimation('n1', 'hello world'));
    const sub = getSub();

    act(() => {
      sub.onSegmentEnd!('n1');
    });
    first.unmount();
    expect(mockNotebookState.completedTypingNodeIds.n1).toBe(true);

    mockTts.subscribe.mockClear();
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello world'));
    expect(result.current.revealed).toBe(11);
    expect(result.current.isAnimating).toBe(false);
    expect(mockTts.subscribe).not.toHaveBeenCalled();
  });
});

describe('skipAnimation', () => {
  it('reveals full text immediately when skipAnimation is true', () => {
    mockNotebookState.notebookMode = true;
    mockSettingsState.ttsEnabled = true;
    const { result } = renderHook(() => useTypingAnimation('n1', 'hello', true));
    expect(result.current.revealed).toBe(5);
    expect(result.current.isAnimating).toBe(false);
  });

  it('does not subscribe when skipAnimation is true', () => {
    mockNotebookState.notebookMode = true;
    mockSettingsState.ttsEnabled = true;
    renderHook(() => useTypingAnimation('n1', 'hello', true));
    expect(mockTts.subscribe).not.toHaveBeenCalled();
  });
});
