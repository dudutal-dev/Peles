import type { Contact, Meeting, OrgEvent, RoutineCheck, RoutineItem, Task } from '../domain/types';
import type { LishkaDB } from './db';
import { appointmentToMeeting, type LegacyAppointment } from './legacy';

export const BACKUP_SCHEMA_VERSION = 2;

export interface BackupFile {
  app: 'lishka';
  schemaVersion: number;
  exportedAt: string;
  data: {
    tasks: Task[];
    routineItems: RoutineItem[];
    routineChecks: RoutineCheck[];
    meetings: Meeting[];
    contacts: Contact[];
    events: OrgEvent[];
  };
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export async function exportBackup(db: LishkaDB): Promise<BackupFile> {
  const [tasks, routineItems, routineChecks, meetings, contacts, events] = await Promise.all([
    db.tasks.toArray(),
    db.routineItems.toArray(),
    db.routineChecks.toArray(),
    db.meetings.toArray(),
    db.contacts.toArray(),
    db.events.toArray(),
  ]);
  return {
    app: 'lishka',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, routineItems, routineChecks, meetings, contacts, events },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function allHaveStringId(v: unknown): v is Array<Record<string, unknown>> {
  return Array.isArray(v) && v.every((row) => isRecord(row) && typeof row.id === 'string');
}

/** בודק שקובץ שנטען הוא באמת גיבוי של האפליקציה, וממיר גיבויים של שלב א'. */
export function validateBackup(json: unknown): Result<BackupFile> {
  if (!isRecord(json) || json.app !== 'lishka') {
    return { ok: false, error: 'הקובץ הזה אינו גיבוי של פלס.' };
  }
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: 'הגיבוי נוצר בגרסה חדשה יותר של האפליקציה. יש לעדכן את האפליקציה ולנסות שוב.' };
  }
  const data = json.data;
  if (!isRecord(data)) return { ok: false, error: 'בקובץ הגיבוי חסרים נתונים.' };

  const tables =
    json.schemaVersion === 1
      ? (['tasks', 'routineItems', 'routineChecks', 'appointments'] as const)
      : (['tasks', 'routineItems', 'routineChecks', 'meetings', 'contacts', 'events'] as const);
  for (const table of tables) {
    if (!allHaveStringId(data[table])) {
      return { ok: false, error: `בקובץ הגיבוי יש רשומות פגומות (${table}).` };
    }
  }
  const tasksOk = (data.tasks as unknown[]).every(
    (t) => isRecord(t) && typeof t.title === 'string' && typeof t.status === 'string',
  );
  if (!tasksOk) return { ok: false, error: 'בקובץ הגיבוי יש משימות פגומות.' };

  const base = {
    tasks: data.tasks as unknown as Task[],
    routineItems: data.routineItems as unknown as RoutineItem[],
    routineChecks: data.routineChecks as unknown as RoutineCheck[],
  };
  const value: BackupFile = {
    app: 'lishka',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : new Date().toISOString(),
    data:
      json.schemaVersion === 1
        ? {
            ...base,
            meetings: (data.appointments as unknown as LegacyAppointment[]).map(appointmentToMeeting),
            contacts: [],
            events: [],
          }
        : {
            ...base,
            meetings: data.meetings as unknown as Meeting[],
            contacts: data.contacts as unknown as Contact[],
            events: data.events as unknown as OrgEvent[],
          },
  };
  return { ok: true, value };
}

/** מחליף את כל הנתונים במכשיר בתוכן הגיבוי. פעולה אטומית: הכל או כלום. */
export async function restoreBackup(db: LishkaDB, backup: BackupFile): Promise<void> {
  const tables = [db.tasks, db.routineItems, db.routineChecks, db.meetings, db.contacts, db.events];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.tasks.bulkPut(backup.data.tasks);
    await db.routineItems.bulkPut(backup.data.routineItems);
    await db.routineChecks.bulkPut(backup.data.routineChecks);
    await db.meetings.bulkPut(backup.data.meetings);
    await db.contacts.bulkPut(backup.data.contacts);
    await db.events.bulkPut(backup.data.events);
  });
}

export function backupFileName(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `palas-backup-${d}.json`;
}
