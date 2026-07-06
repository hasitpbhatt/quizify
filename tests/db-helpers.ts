import { getDb, STORES } from '@/lib/db/db';

export async function clearDbStores(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([STORES.SESSIONS, STORES.SOURCE_CACHE], 'readwrite');
  await Promise.all([
    tx.objectStore(STORES.SESSIONS).clear(),
    tx.objectStore(STORES.SOURCE_CACHE).clear(),
  ]);
  await tx.done;
}
