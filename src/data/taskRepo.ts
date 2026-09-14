import { applyTaskPatch, createTask, type NewTaskInput, type TaskPatch } from '../domain/task';
import type { Task } from '../domain/types';
import type { LishkaDB } from './db';

export async function addTask(db: LishkaDB, input: NewTaskInput): Promise<Task> {
  const task = createTask(input);
  await db.tasks.add(task);
  return task;
}

export async function updateTask(db: LishkaDB, id: string, patch: TaskPatch): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const current = await db.tasks.get(id);
    if (!current) return null;
    const next = applyTaskPatch(current, patch);
    await db.tasks.put(next);
    return next;
  });
}

export async function softDeleteTask(db: LishkaDB, id: string): Promise<void> {
  const now = Date.now();
  await db.tasks.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreTask(db: LishkaDB, id: string): Promise<void> {
  await db.tasks.update(id, { deletedAt: null, updatedAt: Date.now() });
}

/** מוחק לצמיתות משימות שנמחקו לפני יותר מ-30 יום. */
export async function purgeDeletedTasks(db: LishkaDB, olderThanDays = 30): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const stale = await db.tasks.filter((t) => t.deletedAt !== null && t.deletedAt < cutoff).primaryKeys();
  await db.tasks.bulkDelete(stale);
  return stale.length;
}
