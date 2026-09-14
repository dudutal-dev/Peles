import Dexie, { type EntityTable } from 'dexie';
import type {
  Contact,
  Meeting,
  MetaEntry,
  OrgEvent,
  RoutineCheck,
  RoutineItem,
  Task,
} from '../domain/types';
import { appointmentToMeeting, type LegacyAppointment } from './legacy';

/**
 * מסד הנתונים המקומי (IndexedDB דרך Dexie).
 * כל הרשומות נושאות updatedAt ו-deletedAt, כך שבשלב ג' אפשר להוסיף סנכרון
 * מול שרת בלי לשנות את מבנה הנתונים.
 */
export class LishkaDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  routineItems!: EntityTable<RoutineItem, 'id'>;
  routineChecks!: EntityTable<RoutineCheck, 'id'>;
  meetings!: EntityTable<Meeting, 'id'>;
  contacts!: EntityTable<Contact, 'id'>;
  events!: EntityTable<OrgEvent, 'id'>;
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

    // שלב ב': פגישות מהיומן הפנימי הופכות לישיבות שאפשר לתעד; נוספים גורמים ואירועים
    this.version(2)
      .stores({
        meetings: 'id, date',
        contacts: 'id, name',
        events: 'id, targetDate',
      })
      .upgrade(async (tx) => {
        const appointments = (await tx.table('appointments').toArray()) as LegacyAppointment[];
        await tx.table('meetings').bulkPut(appointments.map(appointmentToMeeting));
      });

    this.version(3).stores({ appointments: null });
  }
}

export const db = new LishkaDB();
