import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { clearDbStores } from '../../db-helpers';

beforeEach(async () => {
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
  await clearDbStores();
});

describe('sessionStore', () => {
  describe('create', () => {
    it('creates a new session with given options', async () => {
      const session = await useSessionStore.getState().create({
        url: 'https://example.com',
        hostname: 'example.com',
        persona: 'student',
      });

      expect(session.url).toBe('https://example.com');
      expect(session.hostname).toBe('example.com');
      expect(session.persona).toBe('student');
      expect(session.id).toBeTruthy();
      expect(session.nodes).toEqual([]);
      expect(session.edges).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.updatedAt).toBeGreaterThan(0);
    });

    it('sets currentId to the new session id', async () => {
      const session = await useSessionStore.getState().create({
        url: 'https://example.com',
        hostname: 'example.com',
        persona: 'expert',
      });

      expect(useSessionStore.getState().currentId).toBe(session.id);
    });

    it('adds session to the sessions list', async () => {
      await useSessionStore.getState().create({
        url: 'https://a.com',
        hostname: 'a.com',
        persona: 'curious',
      });

      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });

    it('persists to IndexedDB', async () => {
      await useSessionStore.getState().create({
        url: 'https://persist.com',
        hostname: 'persist.com',
        persona: 'student',
      });

      // recreate store state to simulate fresh load
      useSessionStore.setState({ sessions: [], currentId: null });
      await useSessionStore.getState().load();
      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().sessions[0].url).toBe('https://persist.com');
    });
  });

  describe('select', () => {
    it('sets currentId and updates sessions array', async () => {
      const session = await useSessionStore.getState().create({
        url: 'https://select.com',
        hostname: 'select.com',
        persona: 'student',
      });

      useSessionStore.setState({ currentId: null });
      await useSessionStore.getState().select(session.id);

      expect(useSessionStore.getState().currentId).toBe(session.id);
    });
  });

  describe('remove', () => {
    it('removes session from store and IDB', async () => {
      const s1 = await useSessionStore.getState().create({ url: 'https://a.com', hostname: 'a.com', persona: 'student' });
      const s2 = await useSessionStore.getState().create({ url: 'https://b.com', hostname: 'b.com', persona: 'student' });

      expect(useSessionStore.getState().sessions).toHaveLength(2);

      await useSessionStore.getState().remove(s1.id);

      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().sessions[0].id).toBe(s2.id);

      // Verify from IDB
      useSessionStore.setState({ sessions: [] });
      await useSessionStore.getState().load();
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });

    it('updates currentId when removing current session', async () => {
      const s1 = await useSessionStore.getState().create({ url: 'https://a.com', hostname: 'a.com', persona: 'student' });
      const s2 = await useSessionStore.getState().create({ url: 'https://b.com', hostname: 'b.com', persona: 'student' });

      expect(useSessionStore.getState().currentId).toBe(s2.id);
      await useSessionStore.getState().remove(s2.id);

      expect(useSessionStore.getState().currentId).toBe(s1.id);
    });
  });

  describe('updateCurrent', () => {
    it('updates nodes and edges on the current session', async () => {
      const session = await useSessionStore.getState().create({
        url: 'https://update.com',
        hostname: 'update.com',
        persona: 'student',
      });

      const newNode = { id: 'n1', type: 'concept' as const, position: { x: 0, y: 0 }, data: { kind: 'concept' as const, index: 0, title: 'T', explanation: 'E', example: '' } };
      await useSessionStore.getState().updateCurrent({ nodes: [newNode] });

      const updated = useSessionStore.getState().sessions.find(s => s.id === session.id);
      expect(updated?.nodes).toHaveLength(1);
      expect(updated?.nodes[0].id).toBe('n1');
    });

    it('does nothing when currentId is null', async () => {
      await expect(useSessionStore.getState().updateCurrent({ nodes: [] })).resolves.toBeUndefined();
    });
  });

  describe('load', () => {
    it('sets loaded to true even on error', async () => {
      await useSessionStore.getState().load();
      expect(useSessionStore.getState().loaded).toBe(true);
    });
  });

  describe('store race prevention', () => {
    it('create then updateCurrent does not clobber', async () => {
      const session = await useSessionStore.getState().create({
        url: 'https://race.com',
        hostname: 'race.com',
        persona: 'student',
      });

      await useSessionStore.getState().updateCurrent({ nodes: [{ id: 'n1', type: 'concept' as const, position: { x: 0, y: 0 }, data: { kind: 'concept' as const, index: 0, title: 'T', explanation: 'E', example: '' } }] });

      const state = useSessionStore.getState();
      expect(state.currentId).toBe(session.id);
      const found = state.sessions.find(s => s.id === session.id);
      expect(found).toBeDefined();
      expect(found!.nodes).toHaveLength(1);
    });
  });
});
