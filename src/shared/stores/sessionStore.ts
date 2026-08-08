import { create } from 'zustand';
import type {
  Session,
  QuizData,
  SourceProvenance,
  Persona,
  CanvasNode,
  CanvasEdge,
} from '@/shared/types';
import * as sessionsDb from '@/lib/db/sessionsDb';

/**
 * Serializes async critical sections so overlapping `updateCurrent` calls
 * (e.g. a pipeline `persist()` and a quiz-grade write) can't interleave their
 * IDB read → merge → put → set and clobber each other's data.
 */
function createMutex() {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> =>
    (chain = chain.then(
      () => fn(),
      () => fn(),
    )) as Promise<T>;
}
const writeMutex = createMutex();

/**
 * Ids of sessions deleted in this tab. `remove` runs inside `writeMutex`, but a
 * write queued behind the delete would otherwise read → merge → put a row that
 * no longer exists and resurrect it. Tab-lifetime only.
 */
const tombstones = new Set<string>();

interface SessionState {
  sessions: Session[];
  currentId: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  create: (opts: {
    url: string;
    hostname: string;
    name?: string;
    sourceProvenance?: SourceProvenance;
    persona: Persona;
  }) => Promise<Session>;
  select: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  updateCurrent: (patch: Partial<Session>, sessionId?: string) => Promise<void>;
  /**
   * Full replacement of a session's nodes/edges. Use this for explicit deletes
   * (omitting a node is intentional), unlike `updateCurrent` which preserves any
   * node the patch doesn't mention.
   */
  replaceNodes: (nodes: CanvasNode[], edges?: CanvasEdge[], sessionId?: string) => Promise<void>;
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortByUpdatedDesc(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Merge a single updated session into whatever the freshest in-memory sessions
 * array is at the time of `set`. This is the durable fix for the race we were
 * seeing: a stale `sessions` snapshot captured *before* an awaited IDB write
 * would otherwise clobber concurrent updates.
 */
function upsertSession(sessions: Session[], updated: Session): Session[] {
  const idx = sessions.findIndex((s) => s.id === updated.id);
  if (idx === -1) return sortByUpdatedDesc([...sessions, updated]);
  const next = [...sessions];
  next[idx] = updated;
  return sortByUpdatedDesc(next);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentId: null,
  loaded: false,

  load: async () => {
    try {
      const all = await sessionsDb.getAllSessions();
      // MERGE, never full-replace. `load()` runs on App mount, on every
      // `visibilitychange`, and on Toolbar mount (which remounts during
      // generation). A full-array `set` with a read that started before the
      // pipeline persisted a brand-new session reverts memory to the
      // pre-persist snapshot and the session vanishes from the UI.
      set((state) => {
        const byId = new Map(state.sessions.map((s) => [s.id, s] as const));
        for (const loadedSession of all) {
          // A row from a read that started before a local delete landed must
          // not undo the delete.
          if (tombstones.has(loadedSession.id)) continue;
          const inMemory = byId.get(loadedSession.id);
          // Loaded wins on equal timestamps; a newer in-memory copy (a write
          // that hasn't been re-read yet) is kept.
          byId.set(
            loadedSession.id,
            !inMemory || loadedSession.updatedAt >= inMemory.updatedAt ? loadedSession : inMemory,
          );
        }
        // currentId is left untouched — `select` surfaces a stale id far more
        // honestly than silently repointing it here.
        return { sessions: sortByUpdatedDesc(Array.from(byId.values())), loaded: true };
      });
    } catch (err) {
      console.error('[sessionStore] failed to load sessions:', err);
      set({ loaded: true });
    }
  },

  create: async ({ url, hostname, name, sourceProvenance, persona }) => {
    const now = Date.now();
    const session: Session = {
      id: generateId(),
      name: name?.trim() || hostname,
      url,
      hostname,
      sourceProvenance,
      persona,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
      scores: {},
    };

    await sessionsDb.putSession(session);
    // Use the updater form of `set` so we merge against the freshest sessions
    // array, not a snapshot captured before this awaited write landed.
    set((state) => ({
      sessions: upsertSession(state.sessions, session),
      currentId: session.id,
    }));

    return session;
  },

  select: async (id: string) => {
    let session: Session | undefined;
    try {
      session = await sessionsDb.getSession(id);
    } catch (err) {
      console.error(`[sessionStore] select: IDB read failed for ${id}:`, err);
      throw new Error(
        `Failed to load session ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // A missing row is a real failure, not a success. Silently no-oping made it
    // indistinguishable from a successful select and left callers navigating to
    // a canvas that can never render.
    if (!session) {
      console.error(`[sessionStore] select: session ${id} not found in IndexedDB`);
      throw new Error(`Session not found: ${id}`);
    }

    const found = session; // const so narrowing survives into the `set` closure
    set((state) => ({
      currentId: id,
      sessions: upsertSession(state.sessions, found),
    }));
  },

  remove: async (id: string) => {
    // Inside the mutex: an in-flight `updateCurrent` that read `existing` before
    // the delete and put it back after would otherwise resurrect the row.
    await writeMutex(async () => {
      // Tombstone before the await so anything queued behind us is refused.
      tombstones.add(id);
      try {
        await sessionsDb.deleteSession(id);
      } catch (err) {
        // The row still exists — don't leave a tombstone blocking live writes.
        tombstones.delete(id);
        console.error(`[sessionStore] failed to delete session ${id}:`, err);
        throw err;
      }

      set((state) => {
        const sessions = state.sessions.filter((s) => s.id !== id);
        const currentId = state.currentId === id ? (sessions[0]?.id ?? null) : state.currentId;
        return { sessions: sortByUpdatedDesc(sessions), currentId };
      });
    });
  },

  updateCurrent: async (patch, sessionId) => {
    const targetId = sessionId ?? get().currentId;
    if (!targetId) {
      // The only legitimate silent drop: there is genuinely no target to write to.
      console.warn('[sessionStore] updateCurrent: no target session — patch dropped');
      return;
    }
    if (tombstones.has(targetId)) {
      console.warn(`[sessionStore] updateCurrent: session ${targetId} deleted — patch ignored`);
      return;
    }

    // Serialize the IDB read → merge → put → set so overlapping writers
    // (pipeline persist + quiz grading) can't clobber each other.
    await writeMutex(async () => {
      // Re-check: a `remove` may have landed while this write sat in the queue.
      if (tombstones.has(targetId)) {
        console.warn(`[sessionStore] updateCurrent: session ${targetId} deleted while queued`);
        return;
      }

      let fromDb: Session | undefined;
      try {
        // Read the authoritative copy from IDB so we never overwrite fields that
        // a concurrent update (e.g. addNote + quiz grading) just wrote.
        fromDb = await sessionsDb.getSession(targetId);
      } catch (err) {
        console.error(
          `[sessionStore] updateCurrent: IDB read failed for ${targetId}, ` +
            'falling back to in-memory copy:',
          err,
        );
      }

      // Resolve the merge base from IDB *or* memory. A momentarily missing row
      // (create() not yet visible, deleted in another tab) must never cause us
      // to throw away generated content.
      const base = fromDb ?? get().sessions.find((s) => s.id === targetId);
      if (!base) {
        throw new Error(
          `[sessionStore] updateCurrent: ${targetId} not found in IndexedDB or ` +
            'memory — refusing to silently drop this write',
        );
      }

      // --- node merge ----------------------------------------------------
      // 1. Quiz-grade preservation: the pipeline writes a default
      //    { attempts: [], state: 'untested' } for every quiz on every persist;
      //    never let that overwrite a real user attempt.
      // 2. UNION by node id: nodes in the base that the patch never mentions
      //    are PRESERVED, not deleted. The pipeline rewrites the whole node
      //    array every ~200ms from an accumulator that knows nothing about a
      //    note the user added mid-generation. Explicit deletes must use
      //    `replaceNodes` instead of omitting the node.
      let mergedPatch: Partial<Session> = patch;
      if (patch.nodes) {
        const baseById = new Map((base.nodes ?? []).map((n) => [n.id, n] as const));
        const mergedNodes = patch.nodes.map((node) => {
          const existingNode = baseById.get(node.id);
          if (existingNode?.data?.kind === 'quiz' && node.data?.kind === 'quiz') {
            const existingQuiz = existingNode.data as QuizData;
            const patchQuiz = node.data as QuizData;
            if (
              patchQuiz.attempts.length === 0 &&
              patchQuiz.state === 'untested' &&
              (existingQuiz.attempts.length > 0 || existingQuiz.state !== 'untested')
            ) {
              return {
                ...node,
                data: {
                  ...patchQuiz,
                  attempts: existingQuiz.attempts,
                  state: existingQuiz.state,
                  bestScore: existingQuiz.bestScore,
                } as QuizData,
              };
            }
          }
          return node;
        });

        const patchIds = new Set(patch.nodes.map((n) => n.id));
        (base.nodes ?? []).forEach((node, idx) => {
          if (!patchIds.has(node.id)) {
            mergedNodes.splice(Math.min(idx, mergedNodes.length), 0, node);
          }
        });

        mergedPatch = { ...patch, nodes: mergedNodes };
      }

      const updated: Session = { ...base, ...mergedPatch, updatedAt: Date.now() };

      try {
        await sessionsDb.putSession(updated);
      } catch (err) {
        // Do not swallow: the pipeline needs to know the lesson isn't durable.
        console.error(`[sessionStore] updateCurrent: persist failed ${targetId}:`, err);
        throw err;
      }

      set((state) => ({
        sessions: upsertSession(state.sessions, updated),
        // A background write must never re-pin currentId — that can make a
        // just-deleted or unrelated session current behind the user's back.
        currentId: state.currentId,
      }));
    });
  },

  replaceNodes: async (nodes, edges, sessionId) => {
    const targetId = sessionId ?? get().currentId;
    if (!targetId) {
      console.warn('[sessionStore] replaceNodes: no target session — patch dropped');
      return;
    }
    if (tombstones.has(targetId)) return;

    await writeMutex(async () => {
      if (tombstones.has(targetId)) return;
      const base =
        (await sessionsDb.getSession(targetId)) ?? get().sessions.find((s) => s.id === targetId);
      if (!base) {
        throw new Error(`[sessionStore] replaceNodes: ${targetId} not found`);
      }
      const updated: Session = {
        ...base,
        nodes,
        ...(edges ? { edges } : {}),
        updatedAt: Date.now(),
      };
      await sessionsDb.putSession(updated);
      set((state) => ({
        sessions: upsertSession(state.sessions, updated),
        currentId: state.currentId,
      }));
    });
  },
}));
