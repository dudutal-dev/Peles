/**
 * נתוני הדגמה לפיתוח בלבד (לא נכללים ב-build).
 * מהקונסול: await __lishkaDemo()  /  await __lishkaReset()
 */
import { addDays, startOfDayTs, todayISO } from '../domain/dates';
import { createTask, type NewTaskInput } from '../domain/task';
import type { Task } from '../domain/types';
import { addContact } from './contactRepo';
import { db } from './db';
import { addEvent } from './eventRepo';
import { addMeeting, closeMeeting, updateMeeting } from './meetingRepo';

function daysAgo(n: number): number {
  return startOfDayTs(addDays(todayISO(), -n)) + 9 * 3_600_000;
}

function task(input: NewTaskInput, extra: Partial<Task> = {}): Task {
  return { ...createTask(input, extra.createdAt ?? daysAgo(3)), ...extra };
}

export async function seedDemo(): Promise<void> {
  const today = todayISO();

  const statusMeeting = await addMeeting(db, {
    title: 'ישיבת סטטוס מרפאת חולון',
    date: addDays(today, -2),
    time: '10:00',
    location: 'חדר ישיבות, קומה 4',
  });
  await updateMeeting(db, statusMeeting.id, {
    participants: ['ראש המינהל', 'קבלן א. כהן', 'מנהלת הפרויקט'],
    notes: 'הקבלן ביקש הארכה של שבועיים בשלב השלד. ראש המינהל מבקש עדכון שבועי.',
  });
  const budgetMeeting = await addMeeting(db, { title: 'ישיבת תקציב רבעונית', date: addDays(today, -7), time: '14:00' });
  await closeMeeting(db, budgetMeeting.id);

  const tasks: Task[] = [
    task(
      {
        title: 'אישור בטיחות אש',
        status: 'waiting',
        owner: { kind: 'external', name: 'קבלן א. כהן' },
        dueDate: addDays(today, 3),
        context: { kind: 'project', label: 'מרפאת חולון', refId: null },
        source: { kind: 'meeting', label: statusMeeting.title, refId: statusMeeting.id },
        tags: ['בטיחות'],
        reminder: { daysBefore: 3, repeatDailyWhenOverdue: true },
      },
      { statusChangedAt: daysAgo(9), createdAt: daysAgo(9) },
    ),
    task(
      {
        title: 'לוח זמנים מעודכן לשלב השלד',
        status: 'waiting',
        owner: { kind: 'external', name: 'קבלן א. כהן' },
        dueDate: addDays(today, 5),
        source: { kind: 'meeting', label: statusMeeting.title, refId: statusMeeting.id },
      },
      { statusChangedAt: daysAgo(2), createdAt: daysAgo(2) },
    ),
    task(
      {
        title: 'לשלוח לראש המינהל עדכון שבועי על חולון',
        source: { kind: 'meeting', label: statusMeeting.title, refId: statusMeeting.id },
        dueDate: addDays(today, 1),
      },
      { createdAt: daysAgo(2) },
    ),
    task(
      {
        title: 'תכניות מעודכנות לאגף האשפוז',
        status: 'waiting',
        owner: { kind: 'external', name: 'משרד אדריכלים לוי' },
        dueDate: addDays(today, -2),
        context: { kind: 'project', label: 'בית חולים לדוגמה', refId: null },
        directorAwaits: true,
      },
      { statusChangedAt: daysAgo(16), createdAt: daysAgo(16) },
    ),
    task({
      title: 'לתאם סיור של ראש המינהל במחוז צפון',
      dueDate: today,
      directorAwaits: true,
      tags: ['מחוז צפון'],
    }),
    task({
      title: 'להכין סיכום לישיבת התקציב הרבעונית',
      dueDate: addDays(today, 1),
      urgent: true,
      tags: ['תקציב'],
      source: { kind: 'meeting', label: budgetMeeting.title, refId: budgetMeeting.id },
    }),
    task({
      title: 'לוודא חתימה על הזמנת עבודה 4471',
      status: 'verify',
      dueDate: addDays(today, -1),
      owner: { kind: 'external', name: 'אגף רכש' },
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
    task({ title: 'לבדוק מה עם החניה במרפאת רמלה', inbox: true }, { createdAt: daysAgo(0) }),
    task(
      { title: 'להזמין חדר ישיבות ליום חמישי', status: 'done' },
      { completedAt: daysAgo(1), statusChangedAt: daysAgo(1) },
    ),
  ];
  await db.tasks.bulkPut(tasks);

  await addMeeting(db, { title: 'ישיבת הנהלת המינהל', date: today, time: '09:00', location: 'חדר ישיבות, קומה 4' });
  await addMeeting(db, { title: 'שיחת תקציב עם חטיבת תשתיות', date: today, time: '15:00' });

  await addContact(db, { name: 'קבלן א. כהן', type: 'contractor', role: 'מנהל עבודה: יוסי', phone: '050-0000000' });
  await addContact(db, { name: 'משרד אדריכלים לוי', type: 'consultant' });
  await addContact(db, { name: 'מחוז דרום', type: 'district' });

  await addEvent(db, { type: 'farewell', title: 'פרידה מרפי', targetDate: addDays(today, 16), expectedAttendees: 40 }, today);
}

export async function resetAll(): Promise<void> {
  await Promise.all([
    db.tasks.clear(),
    db.meetings.clear(),
    db.contacts.clear(),
    db.events.clear(),
    db.routineChecks.clear(),
    db.meta.delete('guideSeen'),
  ]);
}

export function exposeDemo(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__lishkaDemo = seedDemo;
  w.__lishkaReset = resetAll;
}
