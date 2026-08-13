import { getDb, STORES } from './db';
import type { LearningGoal } from '@/shared/types';

export async function putGoal(goal: LearningGoal): Promise<void> {
  const db = await getDb();
  await db.put(STORES.GOALS, goal);
}

export async function getGoal(id: string): Promise<LearningGoal | undefined> {
  const db = await getDb();
  return (await db.get(STORES.GOALS, id)) as LearningGoal | undefined;
}

export async function getAllGoals(): Promise<LearningGoal[]> {
  const db = await getDb();
  return (await db.getAll(STORES.GOALS)) as LearningGoal[];
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORES.GOALS, id);
}
