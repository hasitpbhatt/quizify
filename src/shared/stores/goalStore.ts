import { create } from 'zustand';
import type { LearningGoal, ConceptMastery } from '@/shared/types';
import * as goalsDb from '@/lib/db/goalsDb';
import { useSessionStore } from './sessionStore';
import { computeNextReviewAt } from '@/shared/learningProgress';

interface GoalState {
  goals: LearningGoal[];
  loaded: boolean;
  activeGoalId: string | null;

  load: () => Promise<void>;
  createGoal: (opts: {
    title: string;
    subject?: string;
    examDate?: number;
    dailyMinutes?: number;
    confidence: 'low' | 'medium' | 'high';
  }) => Promise<LearningGoal>;
  setActiveGoal: (id: string | null) => void;
  addSessionToGoal: (goalId: string, sessionId: string) => Promise<void>;
  updateConceptMastery: (
    sessionId: string,
    conceptId: string,
    grade: 'correct' | 'partial' | 'incorrect',
    context?: 'immediate' | 'delayed',
  ) => Promise<void>;
  getDueReviews: () => Array<{
    goalId?: string;
    sessionId: string;
    sessionName: string;
    conceptId: string;
    nextReviewAt: number;
  }>;
  getGoalProgress: (goalId: string) => {
    learned: number;
    due: number;
    total: number;
    pct: number;
  };
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  loaded: false,
  activeGoalId: null,

  load: async () => {
    try {
      const all = await goalsDb.getAllGoals();
      set({ goals: all.sort((a, b) => b.updatedAt - a.updatedAt), loaded: true });
    } catch (err) {
      console.error('[goalStore] failed to load goals:', err);
      set({ loaded: true });
    }
  },

  createGoal: async ({ title, subject, examDate, dailyMinutes = 20, confidence }) => {
    const now = Date.now();
    const goal: LearningGoal = {
      id: generateId(),
      title: title.trim(),
      subject: subject?.trim(),
      examDate,
      dailyMinutes,
      confidence,
      createdAt: now,
      updatedAt: now,
      sessionIds: [],
    };

    await goalsDb.putGoal(goal);
    set((state) => ({
      goals: [goal, ...state.goals],
      activeGoalId: goal.id,
    }));

    return goal;
  },

  setActiveGoal: (id) => set({ activeGoalId: id }),

  addSessionToGoal: async (goalId, sessionId) => {
    const goal = get().goals.find((g) => g.id === goalId);
    if (!goal) return;

    if (!goal.sessionIds.includes(sessionId)) {
      const updated: LearningGoal = {
        ...goal,
        sessionIds: [...goal.sessionIds, sessionId],
        updatedAt: Date.now(),
      };
      await goalsDb.putGoal(updated);
      set((state) => ({
        goals: state.goals.map((g) => (g.id === goalId ? updated : g)),
      }));

      // Also link session to goal in sessionStore
      await useSessionStore.getState().updateCurrent({ goalId }, sessionId);
    }
  },

  updateConceptMastery: async (sessionId, conceptId, grade, context = 'immediate') => {
    const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const existingMastery = session.masteryByConceptId?.[conceptId] ?? {
      conceptId,
      attemptCount: 0,
      successStreak: 0,
      stabilityScore: 0.2,
      nextReviewAt: Date.now(),
      lastGrade: grade,
      lastContext: context,
    };

    const newStreak = grade === 'correct' ? existingMastery.successStreak + 1 : 0;
    const newStability =
      grade === 'correct'
        ? Math.min(1.0, existingMastery.stabilityScore + 0.2)
        : Math.max(0.1, existingMastery.stabilityScore - 0.2);

    const nextReviewAt = computeNextReviewAt(grade, Date.now(), newStreak);

    const updatedMastery: ConceptMastery = {
      conceptId,
      attemptCount: existingMastery.attemptCount + 1,
      successStreak: newStreak,
      stabilityScore: newStability,
      nextReviewAt,
      lastGrade: grade,
      lastContext: context,
    };

    const updatedMap = {
      ...(session.masteryByConceptId ?? {}),
      [conceptId]: updatedMastery,
    };

    const updatedNextReview = {
      ...(session.nextReviewAtByConceptId ?? {}),
      [conceptId]: nextReviewAt,
    };

    await useSessionStore.getState().updateCurrent(
      {
        masteryByConceptId: updatedMap,
        nextReviewAtByConceptId: updatedNextReview,
        lastActivityAt: Date.now(),
      },
      sessionId,
    );
  },

  getDueReviews: () => {
    const now = Date.now();
    const sessions = useSessionStore.getState().sessions;
    const dueList: Array<{
      goalId?: string;
      sessionId: string;
      sessionName: string;
      conceptId: string;
      nextReviewAt: number;
    }> = [];

    for (const session of sessions) {
      const mastery = session.masteryByConceptId ?? {};
      const conceptNodes = (session.nodes ?? []).filter((n) => n.data.kind === 'concept');

      for (const node of conceptNodes) {
        const itemMastery = mastery[node.id];
        const nextReviewAt =
          itemMastery?.nextReviewAt ?? session.nextReviewAtByConceptId?.[node.id];

        if (nextReviewAt && nextReviewAt <= now) {
          dueList.push({
            goalId: session.goalId,
            sessionId: session.id,
            sessionName: session.name,
            conceptId: node.id,
            nextReviewAt,
          });
        }
      }
    }

    return dueList.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  },

  getGoalProgress: (goalId) => {
    const goal = get().goals.find((g) => g.id === goalId);
    if (!goal) return { learned: 0, due: 0, total: 0, pct: 0 };

    const sessions = useSessionStore
      .getState()
      .sessions.filter((s) => goal.sessionIds.includes(s.id));
    let total = 0;
    let learned = 0;
    let due = 0;
    const now = Date.now();

    for (const session of sessions) {
      const conceptNodes = (session.nodes ?? []).filter((n) => n.data.kind === 'concept');
      total += conceptNodes.length;

      for (const node of conceptNodes) {
        const mastery = session.masteryByConceptId?.[node.id];
        if (mastery) {
          if (mastery.nextReviewAt <= now) {
            due++;
          } else if (mastery.successStreak >= 1) {
            learned++;
          }
        }
      }
    }

    const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
    return { learned, due, total, pct };
  },
}));
