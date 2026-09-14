import type { Appointment, RoutineCheck, RoutineItem, Task } from '../domain/types';
import type { LishkaDB } from './db';

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupFile {
  app: 'lishka';
  schemaVersion: number;
  exportedAt: string;
  data: {
    tasks: Task[];
    routineItems: RoutineItem[];
    routineChecks: RoutineCheck[];
    appointments: Appointment[];
  };
}

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export async function exportBackup(db: LishkaDB): Promise<BackupFile> {
  const [tasks, routineItems, routineChecks, appointments] = await Promise.all([
    db.tasks.toArray(),
    db.routineItems.toArray(),
    db.routineChecks.toArray(),
    db.appointments.toArray(),
  ]);
  return {
    app: 'lishka',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, routineItems, routineChecks, appointments },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function allHaveStringId(v: unknown, idField = 'id'): boolean {
  return Array.isArray(v) && v.every((row) => isRecord(row) && typeof row[idField] === 'string');
}

/** בודק שקובץ שנטען הוא באמת גיבוי של האפליקציה, לפני שמחליפים בו נתונים. */
export function validateBackup(json: unknown): Result<BackupFile> {
  if (!isRecord(json) || json.app !== 'lishka') {
    return { ok: false, error: 'הקובץ הזה אינו גיבוי של פלס.' };
  }
  if (typeof json.schemaVersion !== 'number' || json.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: 'הגיבוי נוצר בגרסה חדשה יותר של האפליקציה. יש לעדכן את האפליקציה ולנסות שוב.' };
  }
  const data = json.data;
  if (!isRecord(data)) return { ok: false, error: 'בקובץ הגיבוי חסרים נתונים.' };

  const tables = ['tasks', 'routineItems', 'routineChecks', 'appointments'] as const;
  for (const table of tables) {
    if (!allHaveStringId(data[table])) {
      return { ok: false, error: `בקובץ הגיבוי יש רשומות פגומות (${table}).` };
    }
  }
  const tasksOk = (data.tasks as unknown[]).every(
    (t) => isRecord(t) && typeof t.title === 'string' && typeof t.status === 'string',
  );
  if (!tasksOk) return { ok: false, error: 'בקובץ הגיבוי יש משימות פגומות.' };

  return { ok: true, value: json as unknown as BackupFile };
}

/** מחליף את כל הנתונים במכשיר בתוכן הגיבוי. פעולה אטומית: הכל או כלום. */
export async function restoreBackup(db: LishkaDB, backup: BackupFile): Promise<void> {
  await db.transaction('rw', [db.tasks, db.routineItems, db.routineChecks, db.appointments], async () => {
    await Promise.all([
      db.tasks.clear(),
      db.routineItems.clear(),
      db.routineChecks.clear(),
      db.appointments.clear(),
    ]);
    await db.tasks.bulkPut(backup.data.tasks);
    await db.routineItems.bulkPut(backup.data.routineItems);
    await db.routineChecks.bulkPut(backup.data.routineChecks);
    await db.appointments.bulkPut(backup.data.appointments);
  });
}

export function backupFileName(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `palas-backup-${d}.json`;
}
