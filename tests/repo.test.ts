import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, restoreBackup, validateBackup } from '../src/data/backup';
import { LishkaDB } from '../src/data/db';
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

  it.each([
    [null, 'אינו גיבוי'],
    [{ app: 'other' }, 'אינו גיבוי'],
    [{ app: 'lishka', schemaVersion: 99, data: {} }, 'גרסה חדשה'],
    [{ app: 'lishka', schemaVersion: 1 }, 'חסרים נתונים'],
    [{ app: 'lishka', schemaVersion: 1, data: { tasks: [{}], routineItems: [], routineChecks: [], appointments: [] } }, 'פגומות'],
  ])('rejects invalid backups (%#)', (input, message) => {
    const r = validateBackup(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });
});
