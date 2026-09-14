import Dexie, { type EntityTable } from 'dexie';
import type { Appointment, MetaEntry, RoutineCheck, RoutineItem, Task } from '../domain/types';

/**
 * מסד הנתונים המקומי (IndexedDB דרך Dexie).
 * כל הרשומות נושאות updatedAt ו-deletedAt, כך שבשלב ב' אפשר להוסיף סנכרון
 * מול שרת בלי לשנות את מבנה הנתונים.
 */
export class LishkaDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  routineItems!: EntityTable<RoutineItem, 'id'>;
  routineChecks!: EntityTable<RoutineCheck, 'id'>;
  appointments!: EntityTable<Appointment, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'lishka') {
    super(name);
    this.version(1).stores({
      tasks: 'id, status, dueDate, updatedAt',
      routineItems: 'id, order',
      routineChecks: 'id, periodKey, routineItemId',
      appointments: 'id, date',
      meta: 'key',
    });
  }
}

export const db = new LishkaDB();
