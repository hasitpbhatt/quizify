import { create } from 'zustand';
import type { Session, QuizData } from '@/shared/types';
import * as sessionsDb from '@/lib/db/sessionsDb';

interface SessionState {
  sessions: Session[];
  currentId: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  create: (opts: { url: string; hostname: string; persona: import('@/shared/types').Persona }) => Promise<Session>;
  select: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  updateCurrent: (patch: Partial<Session>) => Promise<void>;
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
 * would otherwise clobber concurrent updates (e.g. `create` running alongside
 * `runPipeline`'s `updateCurrent`).
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
      set({ sessions: sortByUpdatedDesc(all), loaded: true });
    } catch (err) {
      console.error('[sessionStore] failed to load sessions:', err);
      set({ loaded: true });
    }
  },

  create: async ({ url, hostname, persona }) => {
    const now = Date.now();
    const session: Session = {
      id: generateId(),
      name: hostname,
      url,
      hostname,
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
    const session = await sessionsDb.getSession(id);
    // Always pin currentId if the session exists in IDB — even if the
    // in-memory sessions list doesn't yet contain it (concurrent updates can
    // briefly leave it out).
    if (session) {
      set((state) => ({
        currentId: id,
        sessions: upsertSession(state.sessions, session),
      }));
    }
  },

  remove: async (id: string) => {
    await sessionsDb.deleteSession(id);
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const currentId = state.currentId === id ? (sessions[0]?.id ?? null) : state.currentId;
      return { sessions: sortByUpdatedDesc(sessions), currentId };
    });
  },

  updateCurrent: async (patch) => {
    const { currentId } = get();
    if (!currentId) return;

    // Read the authoritative copy from IDB so we never overwrite fields that
    // a concurrent update (e.g. addNote + quiz grading) just wrote.
    const existing = await sessionsDb.getSession(currentId);
    if (!existing) return;

    // When patch replaces nodes, preserve quiz grade data from IDB so the
    // pipeline's persist() doesn't clobber user-authored attempts/state.
    let mergedPatch = patch;
    if (patch.nodes && existing.nodes.length > 0) {
      const existingNodeMap = new Map(existing.nodes.map(n => [n.id, n]));
      const mergedNodes = patch.nodes.map(node => {
        const existingNode = existingNodeMap.get(node.id);
        if (existingNode?.data?.kind === 'quiz' && node.data?.kind === 'quiz') {
          const existingQuiz = existingNode.data as QuizData;
          const patchQuiz = node.data as QuizData;
          // Pipeline writes default { attempts: [], state: 'untested' } — don't
          // let that overwrite a user's in-progress or completed grade.
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
      mergedPatch = { ...patch, nodes: mergedNodes };
    }

    const updated: Session = { ...existing, ...mergedPatch, updatedAt: Date.now() };
    await sessionsDb.putSession(updated);

    set((state) => ({
      sessions: upsertSession(state.sessions, updated),
      currentId: state.currentId ?? currentId,
    }));
  },
}));
