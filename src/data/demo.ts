/**
 * נתוני הדגמה לפיתוח בלבד (לא נכללים ב-build).
 * מהקונסול: await __lishkaDemo()  /  await __lishkaReset()
 */
import { addDays, startOfDayTs, todayISO } from '../domain/dates';
import { createTask, type NewTaskInput } from '../domain/task';
import type { Task } from '../domain/types';
import { db } from './db';
import { addAppointment } from './routineRepo';

function daysAgo(n: number): number {
  return startOfDayTs(addDays(todayISO(), -n)) + 9 * 3_600_000;
}

function task(input: NewTaskInput, extra: Partial<Task> = {}): Task {
  return { ...createTask(input, extra.createdAt ?? daysAgo(3)), ...extra };
}

export async function seedDemo(): Promise<void> {
  const today = todayISO();
  const tasks: Task[] = [
    task(
      {
        title: 'אישור בטיחות אש',
        status: 'waiting',
        owner: { kind: 'external', name: 'קבלן א. כהן' },
        dueDate: addDays(today, 3),
        context: { kind: 'project', label: 'מרפאת חולון', refId: null },
        source: { kind: 'meeting', label: 'ישיבת סטטוס חולון', refId: null },
        tags: ['בטיחות'],
        reminder: { daysBefore: 3, repeatDailyWhenOverdue: true },
      },
      { statusChangedAt: daysAgo(9), createdAt: daysAgo(9) },
    ),
    task(
      {
        title: 'תכניות מעודכנות לאגף האשפוז',
        status: 'waiting',
        owner: { kind: 'external', name: 'משרד אדריכלים לוי' },
        dueDate: addDays(today, -2),
        context: { kind: 'project', label: 'בית חולים מאיר', refId: null },
        directorAwaits: true,
      },
      { statusChangedAt: daysAgo(16), createdAt: daysAgo(16) },
    ),
    task({
      title: 'לתאם סיור של ראש המינהל במחוז צפון',
      dueDate: today,
      directorAwaits: true,
      context: { kind: 'contact', label: 'מחוז צפון', refId: null },
      tags: ['מחוז צפון'],
    }),
    task({
      title: 'להכין סיכום לישיבת התקציב הרבעונית',
      dueDate: addDays(today, 1),
      urgent: true,
      tags: ['תקציב'],
    }),
    task({
      title: 'לוודא חתימה על הזמנת עבודה 4471',
      status: 'verify',
      dueDate: addDays(today, -1),
      context: { kind: 'contact', label: 'אגף רכש', refId: null },
    }),
    task(
      {
        title: 'הצעת מחיר לשיפוץ מרפאת באר שבע',
        status: 'waiting',
        owner: { kind: 'external', name: 'מחוז דרום' },
        dueDate: addDays(today, 6),
        context: { kind: 'project', label: 'מרפאת באר שבע', refId: null },
        tags: ['מחוז דרום'],
      },
      { statusChangedAt: daysAgo(4) },
    ),
    task({
      title: 'להזמין מתנה לאירוע הפרידה',
      dueDate: addDays(today, 10),
      context: { kind: 'event', label: 'אירוע פרידה לרפי', refId: null },
    }),
    task({ title: 'לבדוק מה עם החניה במרפאת רמלה', inbox: true }, { createdAt: daysAgo(0) }),
    task(
      { title: 'להזמין חדר ישיבות ליום חמישי', status: 'done' },
      { completedAt: daysAgo(1), statusChangedAt: daysAgo(1) },
    ),
  ];

  await db.tasks.bulkPut(tasks);
  await addAppointment(db, { title: 'ישיבת הנהלת המינהל', date: today, time: '09:00', location: 'חדר ישיבות, קומה 4' });
  await addAppointment(db, { title: 'פגישה עם קבלן כהן על מרפאת חולון', date: today, time: '12:30' });
  await addAppointment(db, { title: 'שיחת תקציב עם חטיבת תשתיות', date: today, time: '15:00' });
}

export async function resetAll(): Promise<void> {
  await Promise.all([db.tasks.clear(), db.appointments.clear(), db.routineChecks.clear()]);
}

export function exposeDemo(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__lishkaDemo = seedDemo;
  w.__lishkaReset = resetAll;
}
