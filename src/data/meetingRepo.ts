import { createMeeting, type NewMeetingInput, type ParsedCommitment } from '../domain/meetings';
import type { Meeting, Task } from '../domain/types';
import type { LishkaDB } from './db';
import { addTask } from './taskRepo';

export type MeetingPatch = Partial<Pick<Meeting, 'title' | 'date' | 'time' | 'location' | 'participants' | 'notes'>>;

export async function addMeeting(db: LishkaDB, input: NewMeetingInput): Promise<Meeting> {
  const meeting = createMeeting(input);
  await db.meetings.add(meeting);
  return meeting;
}

export async function updateMeeting(db: LishkaDB, id: string, patch: MeetingPatch): Promise<void> {
  await db.meetings.update(id, { ...patch, updatedAt: Date.now() });
}

export async function closeMeeting(db: LishkaDB, id: string): Promise<void> {
  const now = Date.now();
  await db.meetings.update(id, { closedAt: now, updatedAt: now });
}

export async function reopenMeeting(db: LishkaDB, id: string): Promise<void> {
  await db.meetings.update(id, { closedAt: null, updatedAt: Date.now() });
}

/** מחיקת ישיבה לא מוחקת את ההתחייבויות שנולדו בה: הן כבר משימות לכל דבר. */
export async function deleteMeeting(db: LishkaDB, id: string): Promise<void> {
  const now = Date.now();
  await db.meetings.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreMeeting(db: LishkaDB, id: string): Promise<void> {
  await db.meetings.update(id, { deletedAt: null, updatedAt: Date.now() });
}

/** שורת תיעוד בישיבה הופכת למשימת מעקב שמקורה בישיבה. */
export async function addCommitment(db: LishkaDB, meeting: Meeting, c: ParsedCommitment): Promise<Task> {
  return addTask(db, {
    title: c.title,
    dueDate: c.dueDate,
    tags: c.tags,
    owner: c.owner,
    status: c.status,
    source: { kind: 'meeting', label: meeting.title, refId: meeting.id },
  });
}
