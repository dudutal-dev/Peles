import { WEEKDAY_NAMES, daysPhrase } from './labels';
import type { ISODate, Timestamp, Weekday } from './types';

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** מפרק YYYY-MM-DD לחלקים. זורק שגיאה על קלט לא תקין, כי זו תמיד שגיאת תכנות. */
function parts(iso: ISODate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function fromISODate(iso: ISODate): Date {
  const [y, mo, d] = parts(iso);
  return new Date(y, mo - 1, d);
}

/** חישוב ב-UTC כדי שמעבר שעון קיץ/חורף לא יזיז יום. */
function utcDay(iso: ISODate): number {
  const [y, mo, d] = parts(iso);
  return Date.UTC(y, mo - 1, d) / DAY_MS;
}

export function addDays(iso: ISODate, n: number): ISODate {
  const [y, mo, d] = parts(iso);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** מספר הימים מ-from עד to (חיובי כש-to מאוחר יותר). */
export function diffDays(from: ISODate, to: ISODate): number {
  return utcDay(to) - utcDay(from);
}

export function weekday(iso: ISODate): Weekday {
  const [y, mo, d] = parts(iso);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay() as Weekday;
}

/** יום ראשון של השבוע שבו נמצא התאריך. */
export function weekStart(iso: ISODate): ISODate {
  return addDays(iso, -weekday(iso));
}

/** המופע הבא של יום בשבוע, אחרי היום (אם היום הוא אותו יום — בעוד שבוע). */
export function nextWeekday(today: ISODate, target: Weekday): ISODate {
  const delta = (target - weekday(today) + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

/** יום חמישי הקרוב (כולל היום), כסוף שבוע העבודה. בשישי-שבת — חמישי הבא. */
export function endOfWorkWeek(today: ISODate): ISODate {
  const dow = weekday(today);
  if (dow <= 4) return addDays(today, 4 - dow);
  return nextWeekday(today, 4);
}

/** יום ראשון של השבוע הבא. */
export function startOfNextWeek(today: ISODate): ISODate {
  return addDays(weekStart(today), 7);
}

export function startOfDayTs(iso: ISODate): Timestamp {
  return fromISODate(iso).getTime();
}

/** כמה ימים מלאים עברו מאז רגע מסוים, לפי ימים קלנדריים מקומיים. */
export function daysSince(ts: Timestamp, today: ISODate): number {
  return Math.max(0, diffDays(toISODate(new Date(ts)), today));
}

const dayHeaderFmt = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "יום שני, 14 בספטמבר" */
export function formatDayHeader(iso: ISODate): string {
  return dayHeaderFmt.format(fromISODate(iso));
}

export function formatShortDate(iso: ISODate, today: ISODate): string {
  const [y, mo, d] = parts(iso);
  const [ty] = parts(today);
  return y === ty ? `${d}.${mo}` : `${d}.${mo}.${String(y).slice(2)}`;
}

export interface DueDescription {
  text: string;
  tone: 'overdue' | 'today' | 'soon' | 'later';
}

/** תיאור אנושי של תאריך יעד ביחס להיום. */
export function describeDue(due: ISODate, today: ISODate): DueDescription {
  const delta = diffDays(today, due);
  if (delta < 0) return { text: `באיחור ${daysPhrase(delta)}`, tone: 'overdue' };
  if (delta === 0) return { text: 'היום', tone: 'today' };
  if (delta === 1) return { text: 'מחר', tone: 'soon' };
  if (delta < 7) return { text: `יום ${WEEKDAY_NAMES[weekday(due)]}`, tone: 'soon' };
  return { text: formatShortDate(due, today), tone: 'later' };
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}
