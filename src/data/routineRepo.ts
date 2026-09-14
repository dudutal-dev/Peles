import { addDays } from '../domain/dates';
import { WORK_WEEK } from '../domain/labels';
import { checkId } from '../domain/routine';
import { newId } from '../domain/task';
import type { ISODate, Recurrence, RoutineItem } from '../domain/types';
import type { LishkaDB } from './db';

export async function addRoutineItem(
  db: LishkaDB,
  title: string,
  recurrence: Recurrence = { kind: 'days', days: [...WORK_WEEK] },
): Promise<RoutineItem> {
  const now = Date.now();
  const last = await db.routineItems.orderBy('order').last();
  const item: RoutineItem = {
    id: newId(),
    title: title.trim(),
    recurrence,
    order: (last?.order ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.routineItems.add(item);
  return item;
}

export async function updateRoutineItem(
  db: LishkaDB,
  id: string,
  patch: Partial<Pick<RoutineItem, 'title' | 'recurrence'>>,
): Promise<void> {
  await db.routineItems.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteRoutineItem(db: LishkaDB, id: string): Promise<void> {
  const now = Date.now();
  await db.routineItems.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreRoutineItem(db: LishkaDB, id: string): Promise<void> {
  await db.routineItems.update(id, { deletedAt: null, updatedAt: Date.now() });
}

/** מזיז פריט שגרה מקום אחד למעלה או למטה ברשימת הבוקר. */
export async function moveRoutineItem(db: LishkaDB, id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.routineItems, async () => {
    const items = (await db.routineItems.orderBy('order').toArray()).filter((i) => i.deletedAt === null);
    const index = items.findIndex((i) => i.id === id);
    const other = items[index + direction];
    const current = items[index];
    if (!current || !other) return;
    const now = Date.now();
    await db.routineItems.update(current.id, { order: other.order, updatedAt: now });
    await db.routineItems.update(other.id, { order: current.order, updatedAt: now });
  });
}

export async function setRoutineDone(
  db: LishkaDB,
  routineItemId: string,
  periodKey: string,
  done: boolean,
): Promise<void> {
  await db.routineChecks.put({
    id: checkId(routineItemId, periodKey),
    routineItemId,
    periodKey,
    done,
    updatedAt: Date.now(),
  });
}

/** מנקה סימוני שגרה ישנים (מעל 60 יום) כדי שהמסד לא יגדל לנצח. */
export async function purgeOldChecks(db: LishkaDB, today: ISODate): Promise<void> {
  const cutoffKey = addDays(today, -60);
  await db.routineChecks
    .filter((c) => c.periodKey.replace(/^W/, '') < cutoffKey)
    .delete();
}
