import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'quizify';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<unknown>> | null = null;

export function getDb(): Promise<IDBPDatabase<unknown>> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('source_cache', { keyPath: 'url' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          db.createObjectStore('images', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export const STORES = {
  SOURCE_CACHE: 'source_cache',
  SESSIONS: 'sessions',
  IMAGES: 'images',
} as const;
