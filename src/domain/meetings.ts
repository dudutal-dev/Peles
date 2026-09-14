import { parseCapture, type Detected } from './capture';
import { addDays, formatDayHeader, formatShortDate } from './dates';
import { applyTaskPatch, newId, type TaskPatch } from './task';
import type { ISODate, Meeting, Owner, OwnerKind, Task, TaskStatus, Timestamp } from './types';

export interface NewMeetingInput {
  title: string;
  date: ISODate;
  time?: string;
  location?: string;
  participants?: string[];
  notes?: string;
}

export function createMeeting(input: NewMeetingInput, now: Timestamp = Date.now()): Meeting {
  return {
    id: newId(),
    title: input.title.trim(),
    date: input.date,
    time: input.time ?? '',
    location: input.location?.trim() ?? '',
    participants: cleanList(input.participants ?? []),
    notes: input.notes ?? '',
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function cleanList(items: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** ישיבות ביום נתון, לפי שעה; ישיבות בלי שעה בסוף. */
export function meetingsOn(meetings: readonly Meeting[], date: ISODate): Meeting[] {
  return meetings.filter((m) => m.deletedAt === null && m.date === date).sort(byDateTime);
}

function byDateTime(a: Meeting, b: Meeting): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time === b.time) return a.createdAt - b.createdAt;
  if (a.time === '') return 1;
  if (b.time === '') return -1;
  return a.time < b.time ? -1 : 1;
}

/** קישור דו-כיווני: משימה שייכת לישיבה אם זה המקור שלה או ההקשר שלה. */
export function isMeetingTask(t: Task, meetingId: string): boolean {
  return t.source.refId === meetingId || (t.context?.kind === 'meeting' && t.context.refId === meetingId);
}

export function meetingTasks(tasks: readonly Task[], meetingId: string): Task[] {
  return tasks
    .filter((t) => t.deletedAt === null && isMeetingTask(t, meetingId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function isDocumented(m: Meeting, tasks: readonly Task[]): boolean {
  return m.notes.trim() !== '' || m.participants.length > 0 || tasks.some((t) => t.deletedAt === null && isMeetingTask(t, m.id));
}

export interface MeetingLists {
  today: Meeting[];
  /** עברו, תועדו ועוד לא נסגרו. */
  toSummarize: Meeting[];
  upcoming: Meeting[];
  past: Meeting[];
}

export function meetingLists(meetings: readonly Meeting[], tasks: readonly Task[], today: ISODate): MeetingLists {
  const live = meetings.filter((m) => m.deletedAt === null).sort(byDateTime);
  const monthAgo = addDays(today, -30);
  const monthAhead = addDays(today, 30);
  const toSummarize = live.filter((m) => m.date < today && m.closedAt === null && isDocumented(m, tasks));
  return {
    today: live.filter((m) => m.date === today),
    toSummarize,
    upcoming: live.filter((m) => m.date > today && m.date <= monthAhead),
    past: live
      .filter((m) => m.date < today && m.date >= monthAgo && !toSummarize.includes(m))
      .reverse(),
  };
}

const DIRECTOR_ALIASES = new Set(['ראש המינהל', 'ראש מינהל', 'רמ', 'ר"מ', 'ר״מ']);

function ownerFromName(name: string): Owner {
  const n = name.trim();
  if (n === 'אני') return { kind: 'me', name: '' };
  if (DIRECTOR_ALIASES.has(n)) return { kind: 'director', name: '' };
  return { kind: 'external', name: n };
}

export interface ParsedCommitment {
  title: string;
  dueDate: ISODate | null;
  tags: string[];
  owner: Owner;
  status: TaskStatus;
  detected: Detected[];
}

/**
 * שורת תיעוד בישיבה: "מי התחייב למה עד מתי".
 * ‎@שם קובע גורם (‎@אני, ‎@ראש_המינהל מוכרים); אחרת קובעת הבחירה בכפתורים.
 * פריט באחריות אחרים נכנס כ"ממתין לתגובה".
 */
export function parseCommitment(
  line: string,
  today: ISODate,
  fallbackOwner: OwnerKind,
  ignoreTokens: readonly string[] = [],
): ParsedCommitment {
  const parsed = parseCapture(line, today, ignoreTokens);
  const owner: Owner = parsed.ownerName
    ? ownerFromName(parsed.ownerName)
    : { kind: fallbackOwner, name: '' };
  return {
    title: parsed.title,
    dueDate: parsed.dueDate,
    tags: parsed.tags,
    owner,
    status: owner.kind === 'me' ? 'todo' : 'waiting',
    detected: parsed.detected,
  };
}

/** חלוקה אחרי הישיבה: מה אצלי, מה הועבר לאחרים, מה רק למעקב. */
export type MeetingBucket = 'mine' | 'handed' | 'follow' | 'done';

export function bucketOf(t: Task): MeetingBucket {
  if (t.status === 'done') return 'done';
  if (t.status === 'verify') return 'follow';
  if (t.status === 'waiting' || t.owner.kind !== 'me') return 'handed';
  return 'mine';
}

export function bucketPatch(t: Task, bucket: Exclude<MeetingBucket, 'done'>): TaskPatch {
  if (bucket === 'mine') return { status: 'todo', owner: { kind: 'me', name: '' }, inbox: false };
  if (bucket === 'follow') return { status: 'verify', inbox: false };
  return {
    status: 'waiting',
    owner: t.owner.kind === 'me' ? { kind: 'external', name: '' } : t.owner,
    inbox: false,
  };
}

/** מחיל חלוקה ומחזיר את המשימה המעודכנת (לבדיקות ולתצוגה אופטימית). */
export function applyBucket(t: Task, bucket: Exclude<MeetingBucket, 'done'>, now: Timestamp = Date.now()): Task {
  return applyTaskPatch(t, bucketPatch(t, bucket), now);
}

function ownerForSummary(owner: Owner): string {
  if (owner.kind === 'me') return 'הלשכה';
  if (owner.kind === 'director') return 'ראש המינהל';
  return owner.name.trim() || 'לא נקבע';
}

/** טקסט סיכום לשליחה בוואטסאפ או במייל. */
export function meetingSummaryText(meeting: Meeting, tasks: readonly Task[], today: ISODate): string {
  const lines: string[] = [];
  lines.push(`סיכום ישיבה: ${meeting.title}`);
  const when = [formatDayHeader(meeting.date), meeting.time, meeting.location].filter(Boolean).join(', ');
  lines.push(when);
  if (meeting.participants.length > 0) lines.push(`משתתפים: ${meeting.participants.join(', ')}`);

  const items = meetingTasks(tasks, meeting.id);
  if (items.length > 0) {
    lines.push('', 'מה סוכם:');
    items.forEach((t, i) => {
      const parts = [`${i + 1}. ${t.title}`, `אחריות: ${ownerForSummary(t.owner)}`];
      if (t.dueDate) parts.push(`עד ${formatShortDate(t.dueDate, today)}`);
      if (t.status === 'done') parts.push('בוצע');
      lines.push(parts.join(' | '));
    });
  }

  if (meeting.notes.trim()) lines.push('', 'הערות:', meeting.notes.trim());
  return lines.join('\n');
}
