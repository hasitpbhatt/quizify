import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, STORES } from '@/lib/db/db';

describe('getDb', () => {
  beforeEach(async () => {
    // Reset singleton by clearing the module cache isn't possible in vitest,
    // but we can just open/close. fake-indexeddb resets between tests anyway.
    const db = await getDb();
    const tx = db.transaction([STORES.SESSIONS, STORES.SOURCE_CACHE], 'readwrite');
    await Promise.all([
      tx.objectStore(STORES.SESSIONS).clear(),
      tx.objectStore(STORES.SOURCE_CACHE).clear(),
    ]);
    await tx.done;
  });

  it('returns a database instance', async () => {
    const db = await getDb();
    expect(db).toBeDefined();
    expect(db.name).toBe('quizify');
  });

  it('returns the same singleton on repeated calls', async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });

  it('creates both object stores', async () => {
    const db = await getDb();
    expect(db.objectStoreNames).toContain(STORES.SOURCE_CACHE);
    expect(db.objectStoreNames).toContain(STORES.SESSIONS);
  });

  it('has version 2', async () => {
    const db = await getDb();
    expect(db.version).toBe(2);
  });
});

describe('STORES', () => {
  it('has source_cache and sessions', () => {
    expect(STORES.SOURCE_CACHE).toBe('source_cache');
    expect(STORES.SESSIONS).toBe('sessions');
  });
});
