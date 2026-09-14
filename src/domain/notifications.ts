import { addDays, fromISODate, weekday } from './dates';
import { WORK_WEEK, countPhrase } from './labels';
import { meetingsOn } from './meetings';
import { isOpen } from './task';
import type { ISODate, Meeting, Task, Weekday } from './types';
import { needsNudge, snapshot, todayView, waitingView } from './views';

/**
 * תזכורות Push. פרטיות: השרת מקבל רק "מתי להעיר" (זמן + סוג).
 * כשההתראה מגיעה, ה-service worker בונה את הטקסט מהנתונים שבטלפון.
 */
export type ScheduledKind = 'morning' | 'evening';
export type PushKind = ScheduledKind | 'test';

export interface PushSettings {
  morning: boolean;
  morningTime: string;
  evening: boolean;
  eveningTime: string;
  days: Weekday[];
}

export const DEFAULT_PUSH_SETTINGS: PushSettings = {
  morning: true,
  morningTime: '07:30',
  evening: true,
  eveningTime: '17:00',
  days: [...WORK_WEEK],
};

export interface ScheduleEntry {
  at: number;
  kind: ScheduledKind;
}

function atLocal(date: ISODate, hhmm: string): number {
  const d = fromISODate(date);
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** בבוקר מעירים רק אם יש על מה: איחור, מועד היום, לנדנד, דחוף, ראש המינהל מחכה, או ישיבות. */
export function morningHasContent(tasks: readonly Task[], meetings: readonly Meeting[], day: ISODate): boolean {
  if (meetingsOn(meetings, day).length > 0) return true;
  return tasks.some(
    (t) =>
      isOpen(t) &&
      !t.inbox &&
      ((t.dueDate !== null && t.dueDate <= day) || needsNudge(t, day) || t.directorAwaits || t.urgent),
  );
}

/** בערב: פריטים לנדנד, או משימה שמועדה מחר (למשל "הקבלן התחייב עד חמישי" → תזכורת ברביעי בערב). */
export function eveningHasContent(tasks: readonly Task[], day: ISODate): boolean {
  const tomorrow = addDays(day, 1);
  return tasks.some((t) => isOpen(t) && (needsNudge(t, day) || t.dueDate === tomorrow));
}

/** לוח ההתראות ל-30 הימים הבאים, בהנחה שהנתונים לא ישתנו. מחושב מחדש בכל שינוי. */
export function computePushSchedule(
  tasks: readonly Task[],
  meetings: readonly Meeting[],
  settings: PushSettings,
  now: Date,
  horizonDays = 30,
): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  const nowMs = now.getTime();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(start, i);
    if (!settings.days.includes(weekday(day))) continue;
    if (settings.morning) {
      const at = atLocal(day, settings.morningTime);
      if (at > nowMs && morningHasContent(tasks, meetings, day)) out.push({ at, kind: 'morning' });
    }
    if (settings.evening) {
      const at = atLocal(day, settings.eveningTime);
      if (at > nowMs && eveningHasContent(tasks, day)) out.push({ at, kind: 'evening' });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface NotificationContent {
  title: string;
  body: string;
  /** יעד בתוך האפליקציה בלחיצה על ההתראה */
  url: string;
}

function ownerName(t: Task): string {
  if (t.owner.kind === 'director') return 'ראש המינהל';
  return t.owner.kind === 'external' ? t.owner.name.trim() : '';
}

/** טקסט ההתראה. תמיד מחזיר תוכן: iOS מבטל מנוי שמקבל Push בלי התראה גלויה. */
export function composeNotification(
  kind: PushKind,
  tasks: readonly Task[],
  meetings: readonly Meeting[],
  today: ISODate,
): NotificationContent {
  if (kind === 'test') {
    return { title: 'פלס', body: 'ההתראות עובדות. כך תיראה תזכורת.', url: '#/settings' };
  }

  if (kind === 'evening') {
    const tomorrow = addDays(today, 1);
    const dueTomorrow = tasks.filter((t) => isOpen(t) && t.dueDate === tomorrow);
    const nudges = waitingView(tasks).filter((t) => needsNudge(t, today));
    const first = dueTomorrow[0];
    if (first) {
      const who = ownerName(first);
      const more = dueTomorrow.length > 1 ? `, ועוד ${dueTomorrow.length - 1}` : '';
      return {
        title: 'לפני סוף היום',
        body: `מחר המועד: ${first.title}${who ? ` (${who})` : ''}${more}`,
        url: '#/tasks/today',
      };
    }
    const oldest = nudges[0];
    if (oldest) {
      return {
        title: 'לפני סוף היום',
        body: `${countPhrase(nudges.length, 'פריט אחד', 'פריטים')} לנדנד. הוותיק: ${oldest.title}`,
        url: '#/waiting?filter=nudge',
      };
    }
    return { title: 'לפני סוף היום', body: 'הכל בזמן. אין את מי לנדנד.', url: '#/waiting' };
  }

  const snap = snapshot(tasks, today);
  const meetingCount = meetingsOn(meetings, today).length;
  const parts: string[] = [];
  if (snap.overdue > 0) parts.push(`${snap.overdue} באיחור`);
  if (snap.nudges > 0) parts.push(`${snap.nudges} לנדנד`);
  if (meetingCount > 0) parts.push(countPhrase(meetingCount, 'ישיבה אחת היום', 'ישיבות היום'));
  const first = todayView(tasks, today)[0];

  if (parts.length === 0 && !first) {
    return { title: 'סדר היום', body: 'אין איחורים ואין את מי לנדנד. יום טוב.', url: '#/morning' };
  }
  const lead = parts.length > 0 ? parts.join(', ') : 'יש משימה להיום';
  return {
    title: 'סדר היום',
    body: first ? `${lead}. ראשון בתור: ${first.title}` : lead,
    url: '#/morning',
  };
}
