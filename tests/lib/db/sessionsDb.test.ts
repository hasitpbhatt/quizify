import { describe, it, expect, beforeEach } from 'vitest';
import * as sessionsDb from '@/lib/db/sessionsDb';
import { clearDbStores } from '../../db-helpers';
import type { Session } from '@/shared/types';

function makeSession(overrides?: Partial<Session>): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: 'Test',
    url: 'https://test.com',
    hostname: 'test.com',
    persona: 'student',
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
    scores: {},
    ...overrides,
  };
}

beforeEach(async () => {
  await clearDbStores();
});

describe('getAllSessions', () => {
  it('returns empty array when no sessions exist', async () => {
    const sessions = await sessionsDb.getAllSessions();
    expect(sessions).toEqual([]);
  });

  it('returns all stored sessions', async () => {
    const s1 = makeSession({ id: 's1', name: 'First' });
    const s2 = makeSession({ id: 's2', name: 'Second' });
    await sessionsDb.putSession(s1);
    await sessionsDb.putSession(s2);

    const all = await sessionsDb.getAllSessions();
    expect(all).toHaveLength(2);
  });
});

describe('getSession', () => {
  it('returns undefined for non-existent id', async () => {
    const result = await sessionsDb.getSession('non-existent');
    expect(result).toBeUndefined();
  });

  it('returns the session by id', async () => {
    const session = makeSession({ id: 'find-me' });
    await sessionsDb.putSession(session);

    const result = await sessionsDb.getSession('find-me');
    expect(result).toBeDefined();
    expect(result!.id).toBe('find-me');
    expect(result!.name).toBe('Test');
  });
});

describe('putSession', () => {
  it('inserts a new session', async () => {
    const session = makeSession({ id: 'new-session' });
    await sessionsDb.putSession(session);

    const result = await sessionsDb.getSession('new-session');
    expect(result).toBeDefined();
  });

  it('overwrites an existing session', async () => {
    await sessionsDb.putSession(makeSession({ id: 's1', name: 'Original' }));
    await sessionsDb.putSession(makeSession({ id: 's1', name: 'Updated' }));

    const result = await sessionsDb.getSession('s1');
    expect(result!.name).toBe('Updated');
  });
});

describe('deleteSession', () => {
  it('removes a session by id', async () => {
    const session = makeSession({ id: 'to-delete' });
    await sessionsDb.putSession(session);
    expect(await sessionsDb.getSession('to-delete')).toBeDefined();

    await sessionsDb.deleteSession('to-delete');
    expect(await sessionsDb.getSession('to-delete')).toBeUndefined();
  });

  it('does nothing when deleting non-existent id', async () => {
    await expect(sessionsDb.deleteSession('ghost')).resolves.toBeUndefined();
  });
});
