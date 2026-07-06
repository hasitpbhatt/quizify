import { getDb, STORES } from './db';
import type { Session } from '@/shared/types';

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDb();
  return db.getAll(STORES.SESSIONS) as Promise<Session[]>;
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDb();
  return db.get(STORES.SESSIONS, id) as Promise<Session | undefined>;
}

export async function putSession(session: Session): Promise<void> {
  const db = await getDb();
  await db.put(STORES.SESSIONS, session);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.SESSIONS, id);
}
