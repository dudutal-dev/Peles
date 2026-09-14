import type { ContextKind, OwnerKind, SourceKind, TaskStatus, Weekday } from './types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'לביצוע',
  waiting: 'ממתין לתגובה',
  verify: 'לוודא/לאשר',
  done: 'הושלם',
};

/** תוויות קצרות לבחירה מקטעית בנייד. */
export const STATUS_SHORT_LABEL: Record<TaskStatus, string> = {
  todo: 'לביצוע',
  waiting: 'ממתין',
  verify: 'לוודא',
  done: 'הושלם',
};

export const CONTEXT_SHORT_LABEL: Record<ContextKind, string> = {
  project: 'פרויקט',
  contact: 'גורם',
  meeting: 'ישיבה',
  event: 'אירוע',
};

export const OWNER_LABEL: Record<OwnerKind, string> = {
  me: 'אני',
  director: 'ראש המינהל',
  external: 'גורם אחר',
};

export const CONTEXT_LABEL: Record<ContextKind, string> = {
  project: 'פרויקט/נושא',
  contact: 'גורם',
  meeting: 'ישיבה',
  event: 'אירוע',
};

export const SOURCE_LABEL: Record<SourceKind, string> = {
  direct: 'בקשה ישירה',
  self: 'יזומה',
  meeting: 'מישיבה',
};

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: 'ראשון',
  1: 'שני',
  2: 'שלישי',
  3: 'רביעי',
  4: 'חמישי',
  5: 'שישי',
  6: 'שבת',
};

export const WEEKDAY_LETTERS: Record<Weekday, string> = {
  0: 'א׳',
  1: 'ב׳',
  2: 'ג׳',
  3: 'ד׳',
  4: 'ה׳',
  5: 'ו׳',
  6: 'ש׳',
};

export const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WORK_WEEK: Weekday[] = [0, 1, 2, 3, 4];

/** "משימה פתוחה אחת" / "3 פתוחות" */
export function countPhrase(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

/** צורת רבים/יחיד לימים: "יום אחד", "יומיים", "5 ימים". */
export function daysPhrase(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1) return 'יום אחד';
  if (abs === 2) return 'יומיים';
  return `${abs} ימים`;
}
