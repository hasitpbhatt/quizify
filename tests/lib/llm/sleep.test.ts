import { describe, it, expect, vi } from 'vitest';
import { sleep } from '@/lib/llm/sleep';

describe('sleep', () => {
  it('resolves after approximately the given delay', async () => {
    vi.useFakeTimers();
    const p = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('resolves with 0ms delay', async () => {
    vi.useFakeTimers();
    const p = sleep(0);
    vi.advanceTimersByTime(0);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('works with large delay values', async () => {
    vi.useFakeTimers();
    const p = sleep(5000);
    vi.advanceTimersByTime(5000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
