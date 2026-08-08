import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'quizify';
export const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<unknown>> | null = null;

/**
 * Drop the cached open-promise so the next `getDb()` re-attempts the open.
 * Guarded on identity: a late `blocking`/`terminated` event fired by a retired
 * connection must not wipe out a newer, healthy one.
 */
function invalidate(stale: Promise<IDBPDatabase<unknown>>): void {
  if (dbPromise === stale) dbPromise = null;
}

export function getDb(): Promise<IDBPDatabase<unknown>> {
  if (dbPromise) return dbPromise;

  const p = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Guard every create. A previously aborted upgrade can leave the DB with
      // only some of these stores present; an unguarded createObjectStore then
      // throws ConstraintError and aborts the whole versionchange transaction.
      if (!db.objectStoreNames.contains('source_cache')) {
        db.createObjectStore('source_cache', { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'key' });
      }
    },
    blocked(currentVersion, blockedVersion) {
      console.error(
        '[db] openDB blocked — another tab holds an older DB version ' +
          `(open: v${currentVersion}, wanted: v${blockedVersion}). ` +
          'Close other Quizify tabs; this open stays pending until they do.',
      );
    },
    blocking(currentVersion, blockedVersion) {
      console.error(
        '[db] closing our connection — it is blocking an upgrade in another tab ' +
          `(open: v${currentVersion}, wanted: v${blockedVersion})`,
      );
      invalidate(p);
      void p.then((db) => db.close()).catch(() => {});
    },
    terminated() {
      console.error('[db] connection terminated by the browser — will reopen on next call');
      invalidate(p);
    },
  });

  dbPromise = p;

  // Never cache a *rejected* promise. VersionError / SecurityError / Safari
  // private-mode failures would otherwise poison every DB call for the tab's
  // lifetime. Concurrent callers still share this single in-flight open; only a
  // settled rejection clears the cache.
  p.catch((e) => {
    console.error('[db] openDB failed, will retry on next call:', e);
    invalidate(p);
  });

  return p;
}

export const STORES = {
  SOURCE_CACHE: 'source_cache',
  SESSIONS: 'sessions',
  IMAGES: 'images',
} as const;
