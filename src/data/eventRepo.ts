import { addDays, diffDays } from '../domain/dates';
import {
  EVENT_TEMPLATES,
  checklistItems,
  createEvent,
  isEventTask,
  type NewEventInput,
  type TemplateItem,
} from '../domain/events';
import { createTask } from '../domain/task';
import type { ISODate, OrgEvent, Task } from '../domain/types';
import type { LishkaDB } from './db';

export type EventPatch = Partial<
  Pick<OrgEvent, 'title' | 'type' | 'targetDate' | 'expectedAttendees' | 'budget' | 'venue' | 'status' | 'notes'>
>;

function checklistTask(event: OrgEvent, title: string, dueDate: ISODate | null): Task {
  return createTask({
    title,
    dueDate,
    context: { kind: 'event', label: event.title, refId: event.id },
    source: { kind: 'self', label: '', refId: null },
  });
}

/** אירוע חדש נוצר יחד עם checklist לפי סוגו; כל פריט הוא משימה רגילה. */
export async function addEvent(db: LishkaDB, input: NewEventInput, today: ISODate): Promise<OrgEvent> {
  const event = createEvent(input);
  const items = checklistItems(EVENT_TEMPLATES[event.type], event.targetDate, today);
  await db.transaction('rw', db.events, db.tasks, async () => {
    await db.events.add(event);
    await db.tasks.bulkAdd(items.map((i) => checklistTask(event, i.title, i.dueDate)));
  });
  return event;
}

export async function addEventItems(
  db: LishkaDB,
  event: OrgEvent,
  items: readonly TemplateItem[],
  today: ISODate,
): Promise<void> {
  const rows = checklistItems(items, event.targetDate, today).map((i) => checklistTask(event, i.title, i.dueDate));
  await db.tasks.bulkAdd(rows);
}

export async function addEventItem(db: LishkaDB, event: OrgEvent, title: string): Promise<Task> {
  const task = checklistTask(event, title, event.targetDate);
  await db.tasks.add(task);
  return task;
}

/**
 * עדכון פרטי אירוע. כשתאריך היעד זז, תאריכי המשימות הפתוחות זזים באותו מספר ימים,
 * כדי שה-checklist יישאר מסונכרן. מחזיר את מספר המשימות שהוזזו.
 */
export async function updateEvent(db: LishkaDB, id: string, patch: EventPatch): Promise<number> {
  return db.transaction('rw', db.events, db.tasks, async () => {
    const current = await db.events.get(id);
    if (!current) return 0;
    const now = Date.now();
    await db.events.update(id, { ...patch, updatedAt: now });

    let shifted = 0;
    if (patch.targetDate !== undefined && current.targetDate && patch.targetDate && patch.targetDate !== current.targetDate) {
      const delta = diffDays(current.targetDate, patch.targetDate);
      const tasks = await db.tasks.filter((t) => t.deletedAt === null && isEventTask(t, id) && t.status !== 'done' && t.dueDate !== null).toArray();
      for (const t of tasks) {
        await db.tasks.update(t.id, { dueDate: addDays(t.dueDate as ISODate, delta), updatedAt: now });
      }
      shifted = tasks.length;
    }
    return shifted;
  });
}

/** מחיקת אירוע מוחקת גם את ה-checklist שלו, עם אותו חותם זמן כדי שביטול יחזיר בדיוק אותם פריטים. */
export async function deleteEvent(db: LishkaDB, id: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.events, db.tasks, async () => {
    await db.events.update(id, { deletedAt: now, updatedAt: now });
    await db.tasks.filter((t) => t.deletedAt === null && isEventTask(t, id)).modify({ deletedAt: now, updatedAt: now });
  });
}

export async function restoreEvent(db: LishkaDB, id: string): Promise<void> {
  await db.transaction('rw', db.events, db.tasks, async () => {
    const event = await db.events.get(id);
    if (!event || event.deletedAt === null) return;
    const stamp = event.deletedAt;
    const now = Date.now();
    await db.events.update(id, { deletedAt: null, updatedAt: now });
    await db.tasks.filter((t) => t.deletedAt === stamp && isEventTask(t, id)).modify({ deletedAt: null, updatedAt: now });
  });
}
