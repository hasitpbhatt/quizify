import { getDb, STORES } from './db';
import type { SourceProvenance } from '@/shared/types';

export interface SourceCacheEntry {
  url: string;
  content: string;
  cachedAt: number; // ms epoch
  provenance?: SourceProvenance;
}

export async function getCachedSourceEntry(url: string): Promise<SourceCacheEntry | undefined> {
  const db = await getDb();
  const entry = (await db.get(STORES.SOURCE_CACHE, url)) as SourceCacheEntry | undefined;
  if (!entry) return undefined;
  // expire after 24 hours
  if (Date.now() - entry.cachedAt > 24 * 60 * 60 * 1000) {
    await db.delete(STORES.SOURCE_CACHE, url);
    return undefined;
  }
  return entry;
}

export async function getCachedSource(url: string): Promise<string | undefined> {
  return (await getCachedSourceEntry(url))?.content;
}

export async function setCachedSource(
  url: string,
  content: string,
  provenance: SourceProvenance = 'legacy-unknown',
): Promise<void> {
  const db = await getDb();
  await db.put(STORES.SOURCE_CACHE, {
    url,
    content,
    cachedAt: Date.now(),
    provenance,
  } satisfies SourceCacheEntry);
}
