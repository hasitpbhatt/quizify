import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGoalStore } from '@/shared/stores/goalStore';
import { useSessionStore } from '@/shared/stores/sessionStore';
import * as goalsDb from '@/lib/db/goalsDb';

vi.mock('@/lib/db/goalsDb', () => ({
  putGoal: vi.fn().mockResolvedValue(undefined),
  getGoal: vi.fn(),
  getAllGoals: vi.fn().mockResolvedValue([]),
  deleteGoal: vi.fn().mockResolvedValue(undefined),
}));

describe('goalStore', () => {
  beforeEach(() => {
    useGoalStore.setState({ goals: [], loaded: true, activeGoalId: null });
    useSessionStore.setState({ sessions: [], currentId: null, loaded: true });
    vi.clearAllMocks();
  });

  it('creates a new goal and sets it active', async () => {
    const goal = await useGoalStore.getState().createGoal({
      title: 'Biology 101 Midterm',
      subject: 'Biology',
      confidence: 'medium',
      dailyMinutes: 25,
    });

    expect(goal.title).toBe('Biology 101 Midterm');
    expect(goal.subject).toBe('Biology');
    expect(goal.confidence).toBe('medium');
    expect(useGoalStore.getState().activeGoalId).toBe(goal.id);
    expect(goalsDb.putGoal).toHaveBeenCalledWith(goal);
  });

  it('calculates goal progress correctly', async () => {
    const goal = await useGoalStore.getState().createGoal({
      title: 'Psychology Final',
      confidence: 'high',
    });

    // Mock a session linked to this goal
    const session = {
      id: 'sess-1',
      name: 'Memory Systems',
      url: 'https://example.com',
      hostname: 'example.com',
      persona: 'student' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      goalId: goal.id,
      nodes: [
        { id: 'c1', type: 'concept' as const, data: { kind: 'concept' as const, index: 0, title: 'Short Term Memory', explanation: '...', example: '...' } },
        { id: 'c2', type: 'concept' as const, data: { kind: 'concept' as const, index: 1, title: 'Long Term Memory', explanation: '...', example: '...' } },
      ],
      scores: {},
      masteryByConceptId: {
        c1: {
          conceptId: 'c1',
          attemptCount: 2,
          successStreak: 2,
          stabilityScore: 0.6,
          nextReviewAt: Date.now() + 86400000,
          lastGrade: 'correct' as const,
          lastContext: 'immediate' as const,
        },
      },
    };

    useGoalStore.setState({
      goals: [{ ...goal, sessionIds: ['sess-1'] }],
    });
    useSessionStore.setState({ sessions: [session] });

    const progress = useGoalStore.getState().getGoalProgress(goal.id);
    expect(progress.total).toBe(2);
    expect(progress.learned).toBe(1);
    expect(progress.pct).toBe(50);
  });
});
