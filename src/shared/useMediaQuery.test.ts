import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsMobile } from './useMediaQuery';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      mql._handler = handler;
    }),
    removeEventListener: vi.fn(),
    _handler: null as ((e: MediaQueryListEvent) => void) | null,
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList);
  return mql;
}

describe('useMediaQuery', () => {
  it('returns true when query matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when query does not match', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(false);
  });

  it('updates when match changes', () => {
    const mql = mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(true);
    act(() => {
      if (mql._handler) {
        mql._handler({ matches: false } as MediaQueryListEvent);
      }
    });
    expect(result.current).toBe(false);
  });
});

describe('useIsMobile', () => {
  it('returns true for mobile viewport', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false for non-mobile viewport', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('cleans up event listener on unmount', () => {
    const mql = mockMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });

  it('uses correct mobile breakpoint', () => {
    mockMatchMedia(true);
    renderHook(() => useIsMobile());
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 639px)');
  });
});
