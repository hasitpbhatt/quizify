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
    vi.useFakeTimers();
    const oldDate = Date.now() - 25 * 60 * 60 * 1000;
    vi.setSystemTime(oldDate);

    await setCachedSource('https://stale.com', 'old content');

    // Advance past 24h
    vi.setSystemTime(oldDate + 25 * 60 * 60 * 1000);

    const result = await getCachedSource('https://stale.com');
    expect(result).toBeUndefined();

    vi.useRealTimers();
  });

  it('returns content within 24h expiry', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    await setCachedSource('https://fresh.com', 'fresh content');

    // Advance 23 hours — still within 24h
    vi.setSystemTime(start + 23 * 60 * 60 * 1000);

    const result = await getCachedSource('https://fresh.com');
    expect(result).toBe('fresh content');

    vi.useRealTimers();
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
