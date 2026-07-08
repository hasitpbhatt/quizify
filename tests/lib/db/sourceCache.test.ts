import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedSource, setCachedSource } from '@/lib/db/sourceCache';
import { clearDbStores } from '../../db-helpers';

beforeEach(async () => {
  vi.useRealTimers();
  await clearDbStores();
});

describe('sourceCache', () => {
  it('returns undefined for uncached URL', async () => {
    const result = await getCachedSource('https://example.com');
    expect(result).toBeUndefined();
  });

  it('stores and retrieves content', async () => {
    await setCachedSource('https://example.com', 'Hello world');
    const result = await getCachedSource('https://example.com');
    expect(result).toBe('Hello world');
  });

  it('returns undefined and deletes expired entries (over 24h)', async () => {
    const originalNow = Date.now;
    const oldDate = originalNow() - 25 * 60 * 60 * 1000;
    
    // Write at the past date
    Date.now = () => oldDate;
    await setCachedSource('https://stale.com', 'old content');

    // Restore to normal time to read (meaning 25h have elapsed)
    Date.now = originalNow;

    const result = await getCachedSource('https://stale.com');
    expect(result).toBeUndefined();
  });

  it('returns content within 24h expiry', async () => {
    const originalNow = Date.now;
    const start = originalNow();

    // Write at start time
    Date.now = () => start;
    await setCachedSource('https://fresh.com', 'fresh content');

    // Advance 23 hours — still within 24h
    Date.now = () => start + 23 * 60 * 60 * 1000;

    const result = await getCachedSource('https://fresh.com');
    expect(result).toBe('fresh content');

    Date.now = originalNow;
  });

  it('handles multiple URLs independently', async () => {
    await setCachedSource('https://a.com', 'Content A');
    await setCachedSource('https://b.com', 'Content B');

    expect(await getCachedSource('https://a.com')).toBe('Content A');
    expect(await getCachedSource('https://b.com')).toBe('Content B');
  });

  it('overwrites existing cache entry for same URL', async () => {
    await setCachedSource('https://example.com', 'Original');
    await setCachedSource('https://example.com', 'Updated');

    expect(await getCachedSource('https://example.com')).toBe('Updated');
  });
});
