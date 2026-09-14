import { WORK_WEEK } from '../domain/labels';
import type { LishkaDB } from './db';
import { addRoutineItem } from './routineRepo';

export async function getMeta<T extends string | number | boolean | null>(
  db: LishkaDB,
  key: string,
): Promise<T | undefined> {
  const entry = await db.meta.get(key);
  return entry?.value as T | undefined;
}

export async function setMeta(db: LishkaDB, key: string, value: string | number | boolean | null): Promise<void> {
  await db.meta.put({ key, value });
}

/** שגרת ברירת מחדל בהפעלה הראשונה, מתוך הדוגמאות שבמסמך האפיון. ניתנת לעריכה מלאה. */
export async function ensureSeeded(db: LishkaDB): Promise<void> {
  await db.transaction('rw', [db.meta, db.routineItems], async () => {
    if (await getMeta(db, 'seeded')) return;
    await addRoutineItem(db, 'לעבור על יומן ראש המינהל', { kind: 'days', days: [...WORK_WEEK] });
    await addRoutineItem(db, 'לבדוק דואר דחוף', { kind: 'days', days: [...WORK_WEEK] });
    await addRoutineItem(db, 'לעבור על רשימת הממתינים לתגובה', { kind: 'days', days: [...WORK_WEEK] });
    await addRoutineItem(db, 'לעדכן סטטוס פרויקטים פתוחים', { kind: 'weekly' });
    await setMeta(db, 'seeded', true);
  });
}
