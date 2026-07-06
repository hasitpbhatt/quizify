import { getDb, STORES } from './db';

export interface SourceCacheEntry {
  url: string;
  content: string;
  cachedAt: number; // ms epoch
}

export async function getCachedSource(url: string): Promise<string | undefined> {
  const db = await getDb();
  const entry = await db.get(STORES.SOURCE_CACHE, url) as SourceCacheEntry | undefined;
  if (!entry) return undefined;
  // expire after 24 hours
  if (Date.now() - entry.cachedAt > 24 * 60 * 60 * 1000) {
    await db.delete(STORES.SOURCE_CACHE, url);
    return undefined;
  }
  return entry.content;
}

export async function setCachedSource(url: string, content: string): Promise<void> {
  const db = await getDb();
  await db.put(STORES.SOURCE_CACHE, { url, content, cachedAt: Date.now() } satisfies SourceCacheEntry);
}
