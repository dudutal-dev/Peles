import { weekStart, weekday } from './dates';
import { WEEKDAY_LETTERS, WORK_WEEK } from './labels';
import type { ISODate, Recurrence, RoutineCheck, RoutineItem } from './types';

/** מפתח התקופה שבה סימון ביצוע תקף: היום עצמו, או תחילת השבוע לפריט שבועי. */
export function periodKey(recurrence: Recurrence, today: ISODate): string {
  return recurrence.kind === 'weekly' ? `W${weekStart(today)}` : today;
}

export function checkId(routineItemId: string, key: string): string {
  return `${key}|${routineItemId}`;
}

export function appliesOn(recurrence: Recurrence, today: ISODate): boolean {
  if (recurrence.kind === 'weekly') return true;
  return recurrence.days.includes(weekday(today));
}

export interface RoutineEntry {
  item: RoutineItem;
  periodKey: string;
  done: boolean;
}

/**
 * רשימת השגרה של יום נתון. אין צורך "לאפס" כל בוקר:
 * סימון הביצוע שמור לפי מפתח תקופה, ומפתח חדש מתחיל ריק.
 */
export function routineForDay(
  items: readonly RoutineItem[],
  checks: readonly RoutineCheck[],
  today: ISODate,
): RoutineEntry[] {
  const doneIds = new Set(checks.filter((c) => c.done).map((c) => c.id));
  return items
    .filter((i) => i.deletedAt === null && appliesOn(i.recurrence, today))
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const key = periodKey(item.recurrence, today);
      return { item, periodKey: key, done: doneIds.has(checkId(item.id, key)) };
    });
}

export function describeRecurrence(r: Recurrence): string {
  if (r.kind === 'weekly') return 'פעם בשבוע';
  const days = [...r.days].sort((a, b) => a - b);
  if (days.length === 7) return 'כל יום';
  if (days.length === WORK_WEEK.length && WORK_WEEK.every((d) => days.includes(d))) {
    return 'כל יום עבודה';
  }
  if (days.length === 0) return 'לא פעיל';
  return days.map((d) => WEEKDAY_LETTERS[d]).join(' ');
}
