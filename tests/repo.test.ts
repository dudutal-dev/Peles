import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, restoreBackup, validateBackup } from '../src/data/backup';
import { addContact } from '../src/data/contactRepo';
import { LishkaDB } from '../src/data/db';
import { addEvent, deleteEvent, restoreEvent, updateEvent } from '../src/data/eventRepo';
import { addCommitment, addMeeting } from '../src/data/meetingRepo';
import { EVENT_TEMPLATES, eventTasks } from '../src/domain/events';
import { meetingTasks, parseCommitment } from '../src/domain/meetings';
import { ensureSeeded } from '../src/data/meta';
import { addRoutineItem, moveRoutineItem, setRoutineDone } from '../src/data/routineRepo';
import { addTask, purgeDeletedTasks, restoreTask, softDeleteTask, updateTask } from '../src/data/taskRepo';
import { routineForDay } from '../src/domain/routine';
import { TODAY } from './helpers';

let db: LishkaDB;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LishkaDB(`test-${counter}`);
});

afterEach(async () => {
  await db.delete();
});

describe('task repository', () => {
  it('saves every change immediately', async () => {
    const t = await addTask(db, { title: 'אישור בטיחות', inbox: true });
    await updateTask(db, t.id, { owner: { kind: 'external', name: 'כהן' }, inbox: false });
    const stored = await db.tasks.get(t.id);
    expect(stored).toMatchObject({ status: 'waiting', owner: { name: 'כהן' }, inbox: false });
  });

  it('returns null when updating a task that does not exist', async () => {
    expect(await updateTask(db, 'missing', { title: 'x' })).toBeNull();
  });

  it('soft-deletes, restores, and purges old deletions', async () => {
    const t = await addTask(db, { title: 'x' });
    await softDeleteTask(db, t.id);
    expect((await db.tasks.get(t.id))?.deletedAt).not.toBeNull();
    await restoreTask(db, t.id);
    expect((await db.tasks.get(t.id))?.deletedAt).toBeNull();

    await db.tasks.update(t.id, { deletedAt: Date.now() - 40 * 86_400_000 });
    expect(await purgeDeletedTasks(db)).toBe(1);
    expect(await db.tasks.get(t.id)).toBeUndefined();
  });
});

describe('routine repository', () => {
  it('seeds a default routine once', async () => {
    await ensureSeeded(db);
    await ensureSeeded(db);
    expect(await db.routineItems.count()).toBe(4);
  });

  it('reorders items and records checks per period', async () => {
    const a = await addRoutineItem(db, 'א');
    const b = await addRoutineItem(db, 'ב');
    await moveRoutineItem(db, b.id, -1);
    const items = await db.routineItems.toArray();
    expect(routineForDay(items, [], TODAY).map((e) => e.item.title)).toEqual(['ב', 'א']);

    await setRoutineDone(db, a.id, TODAY, true);
    const checks = await db.routineChecks.toArray();
    expect(routineForDay(items, checks, TODAY).find((e) => e.item.id === a.id)?.done).toBe(true);
    await setRoutineDone(db, a.id, TODAY, false);
    expect(routineForDay(items, await db.routineChecks.toArray(), TODAY).find((e) => e.item.id === a.id)?.done).toBe(false);
  });
});

describe('backup', () => {
  it('round-trips all data through export and restore', async () => {
    await addTask(db, { title: 'משימה 1', tags: ['בטיחות'] });
    await addRoutineItem(db, 'שגרה');
    const backup = await exportBackup(db);

    const json: unknown = JSON.parse(JSON.stringify(backup));
    const validated = validateBackup(json);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const other = new LishkaDB(`restore-${counter}`);
    await addTask(other, { title: 'ייעלם' });
    await restoreBackup(other, validated.value);
    const tasks = await other.tasks.toArray();
    expect(tasks.map((t) => t.title)).toEqual(['משימה 1']);
    expect(await other.routineItems.count()).toBe(1);
    await other.delete();
  });

  it('restores a stage-1 backup, turning appointments into meetings', async () => {
    const v1 = {
      app: 'lishka',
      schemaVersion: 1,
      exportedAt: '2026-09-01T10:00:00.000Z',
      data: {
        tasks: [],
        routineItems: [],
        routineChecks: [],
        appointments: [{ id: 'a1', title: 'ישיבת הנהלה', date: TODAY, time: '09:00', location: 'חדר 4', createdAt: 1, updatedAt: 1, deletedAt: null }],
      },
    };
    const validated = validateBackup(v1);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await restoreBackup(db, validated.value);
    expect(await db.meetings.get('a1')).toMatchObject({ title: 'ישיבת הנהלה', time: '09:00', participants: [], closedAt: null });
  });

  it.each([
    [null, 'אינו גיבוי'],
    [{ app: 'other' }, 'אינו גיבוי'],
    [{ app: 'lishka', schemaVersion: 99, data: {} }, 'גרסה חדשה'],
    [{ app: 'lishka', schemaVersion: 1 }, 'חסרים נתונים'],
    [{ app: 'lishka', schemaVersion: 1, data: { tasks: [{}], routineItems: [], routineChecks: [], appointments: [] } }, 'פגומות'],
    [{ app: 'lishka', schemaVersion: 2, data: { tasks: [], routineItems: [], routineChecks: [], meetings: [] } }, 'פגומות'],
  ])('rejects invalid backups (%#)', (input, message) => {
    const r = validateBackup(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });
});

describe('database upgrade', () => {
  it('moves stage-1 appointments into meetings when the app updates', async () => {
    const name = `upgrade-${counter}`;
    const old = new Dexie(name);
    old.version(1).stores({
      tasks: 'id, status, dueDate, updatedAt',
      routineItems: 'id, order',
      routineChecks: 'id, periodKey, routineItemId',
      appointments: 'id, date',
      meta: 'key',
    });
    await old.table('appointments').add({ id: 'a1', title: 'פגישה', date: TODAY, time: '12:30', location: '', createdAt: 1, updatedAt: 1, deletedAt: null });
    old.close();

    const upgraded = new LishkaDB(name);
    expect(await upgraded.meetings.get('a1')).toMatchObject({ title: 'פגישה', time: '12:30', notes: '', participants: [] });
    expect(upgraded.tables.map((t) => t.name)).not.toContain('appointments');
    await upgraded.delete();
  });
});

describe('meetings, contacts and events repositories', () => {
  it('records a commitment as a task that points back to the meeting', async () => {
    const meeting = await addMeeting(db, { title: 'ישיבת סטטוס', date: TODAY });
    const task = await addCommitment(db, meeting, parseCommitment('@כהן אישור בטיחות עד חמישי', TODAY, 'me'));
    expect(task).toMatchObject({ status: 'waiting', source: { kind: 'meeting', refId: meeting.id } });
    expect(meetingTasks(await db.tasks.toArray(), meeting.id)).toHaveLength(1);
  });

  it('creates an event with its checklist, shifts due dates when the date moves, and deletes/restores together', async () => {
    const event = await addEvent(db, { type: 'onboarding', targetDate: '2026-10-01' }, TODAY);
    let tasks = eventTasks(await db.tasks.toArray(), event.id);
    expect(tasks).toHaveLength(EVENT_TEMPLATES.onboarding.length);
    expect(tasks.map((t) => t.dueDate)).toContain('2026-09-21');

    await updateTask(db, tasks[0]!.id, { status: 'done' });
    const doneDue = tasks[0]!.dueDate;
    const shifted = await updateEvent(db, event.id, { targetDate: '2026-10-08' });
    expect(shifted).toBe(EVENT_TEMPLATES.onboarding.length - 1);
    tasks = eventTasks(await db.tasks.toArray(), event.id);
    expect(tasks.find((t) => t.status === 'done')?.dueDate).toBe(doneDue);
    // 28.9 (3 ימים לפני 1.10) זז שבוע קדימה ל-5.10
    expect(tasks.map((t) => t.dueDate)).toContain('2026-10-05');
    expect(tasks.map((t) => t.dueDate)).not.toContain('2026-09-28');

    await deleteEvent(db, event.id);
    expect(eventTasks(await db.tasks.toArray(), event.id)).toHaveLength(0);
    await restoreEvent(db, event.id);
    expect(eventTasks(await db.tasks.toArray(), event.id)).toHaveLength(EVENT_TEMPLATES.onboarding.length);
  });

  it('saves contacts', async () => {
    const c = await addContact(db, { name: 'מחוז דרום', type: 'district' });
    expect(await db.contacts.get(c.id)).toMatchObject({ name: 'מחוז דרום', type: 'district', deletedAt: null });
  });
});
