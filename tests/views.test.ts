import { describe, expect, it } from 'vitest';
import { startOfDayTs } from '../src/domain/dates';
import {
  contextGroups,
  inboxView,
  needsNudge,
  overdueView,
  searchTasks,
  snapshot,
  todayView,
  waitingByOwner,
  waitingView,
} from '../src/domain/views';
import { makeTask, TODAY } from './helpers';

const ts = (iso: string) => startOfDayTs(iso);

describe('todayView', () => {
  it('shows overdue, due today, urgent, director-awaited and nudges — ordered by urgency', () => {
    const later = makeTask({ title: 'later', dueDate: '2026-09-30' });
    const dueToday = makeTask({ title: 'today', dueDate: TODAY });
    const overdue = makeTask({ title: 'overdue', dueDate: '2026-09-10' });
    const urgent = makeTask({ title: 'urgent', urgent: true });
    const director = makeTask({ title: 'director', directorAwaits: true });
    const nudge = makeTask({ title: 'nudge', status: 'waiting', dueDate: '2026-09-15' });
    const done = makeTask({ title: 'done', status: 'done', dueDate: TODAY });
    const inbox = makeTask({ title: 'inbox', inbox: true, urgent: true });

    const view = todayView([later, dueToday, overdue, urgent, director, nudge, done, inbox], TODAY);
    expect(view.map((t) => t.title)).toEqual(['overdue', 'director', 'today', 'urgent', 'nudge']);
  });

  it('ignores deleted tasks', () => {
    const t = makeTask({ dueDate: TODAY, deletedAt: 1 });
    expect(todayView([t], TODAY)).toEqual([]);
  });
});

describe('needsNudge', () => {
  it('starts nudging N days before the due date', () => {
    const t = makeTask({ status: 'waiting', dueDate: '2026-09-17', reminder: { daysBefore: 3, repeatDailyWhenOverdue: false } });
    expect(needsNudge(t, '2026-09-13')).toBe(false);
    expect(needsNudge(t, TODAY)).toBe(true);
    expect(needsNudge(t, '2026-09-17')).toBe(true);
    expect(needsNudge(t, '2026-09-18')).toBe(false);
  });

  it('keeps nudging daily after the due date when asked to', () => {
    const t = makeTask({ status: 'waiting', dueDate: '2026-09-10', reminder: { daysBefore: 1, repeatDailyWhenOverdue: true } });
    expect(needsNudge(t, TODAY)).toBe(true);
  });

  it('only applies to open waiting items with a due date', () => {
    expect(needsNudge(makeTask({ status: 'todo', dueDate: TODAY }), TODAY)).toBe(false);
    expect(needsNudge(makeTask({ status: 'waiting' }), TODAY)).toBe(false);
    expect(needsNudge(makeTask({ status: 'done', dueDate: TODAY }), TODAY)).toBe(false);
  });
});

describe('waitingView', () => {
  it('sorts by how long each item has been stuck, not by due date', () => {
    const recent = makeTask({ title: 'recent', status: 'waiting', dueDate: '2026-09-15', statusChangedAt: ts('2026-09-13') });
    const old = makeTask({ title: 'old', status: 'waiting', dueDate: '2026-10-30', statusChangedAt: ts('2026-08-20') });
    const mid = makeTask({ title: 'mid', status: 'waiting', statusChangedAt: ts('2026-09-01') });
    const todo = makeTask({ title: 'todo' });
    expect(waitingView([recent, old, mid, todo]).map((t) => t.title)).toEqual(['old', 'mid', 'recent']);
  });

  it('groups waiting items by who owes them', () => {
    const a = makeTask({ status: 'waiting', owner: { kind: 'external', name: 'קבלן כהן' } });
    const b = makeTask({ status: 'waiting', owner: { kind: 'external', name: 'קבלן כהן' } });
    const c = makeTask({ status: 'waiting', owner: { kind: 'director', name: '' } });
    const d = makeTask({ status: 'waiting', owner: { kind: 'me', name: '' } });
    const groups = waitingByOwner([a, b, c, d]);
    expect(groups.map((g) => [g.title, g.tasks.length])).toEqual([
      ['קבלן כהן', 2],
      ['לא צוין גורם', 1],
      ['ראש המינהל', 1],
    ]);
  });
});

describe('overdueView', () => {
  it('lists only open tasks past their due date, oldest first', () => {
    const a = makeTask({ title: 'a', dueDate: '2026-09-12' });
    const b = makeTask({ title: 'b', dueDate: '2026-09-01' });
    const c = makeTask({ title: 'c', dueDate: TODAY });
    const d = makeTask({ title: 'd', dueDate: '2026-09-01', status: 'done' });
    expect(overdueView([a, b, c, d], TODAY).map((t) => t.title)).toEqual(['b', 'a']);
  });
});

describe('contextGroups', () => {
  it('groups by context, puts groups with overdue items first, and loose tasks last', () => {
    const tasks = [
      makeTask({ title: '1', context: { kind: 'project', label: 'מרפאת חולון', refId: null } }),
      makeTask({ title: '2', context: { kind: 'project', label: 'מרפאת חולון', refId: null } }),
      makeTask({ title: '3', context: { kind: 'contact', label: 'קבלן כהן', refId: null }, dueDate: '2026-09-01' }),
      makeTask({ title: '4' }),
    ];
    const groups = contextGroups(tasks, TODAY);
    expect(groups.map((g) => [g.title, g.tasks.length, g.overdueCount])).toEqual([
      ['קבלן כהן', 1, 1],
      ['מרפאת חולון', 2, 0],
      ['בלי הקשר', 1, 0],
    ]);
  });
});

describe('search, inbox and snapshot', () => {
  it('finds tasks by title, owner, context and tags, ignoring niqqud', () => {
    const t = makeTask({
      title: 'אישור בטיחות אש',
      owner: { kind: 'external', name: 'קבלן כהן' },
      context: { kind: 'project', label: 'מרפאת חולון', refId: null },
      tags: ['מחוז דן'],
    });
    const other = makeTask({ title: 'להזמין קייטרינג' });
    expect(searchTasks([t, other], 'כהן חולון')).toEqual([t]);
    expect(searchTasks([t, other], 'בְּטִיחוּת')).toEqual([t]);
    expect(searchTasks([t, other], 'מחוז')).toEqual([t]);
    expect(searchTasks([t, other], '')).toHaveLength(2);
  });

  it('lists quick-captured items newest first', () => {
    const a = makeTask({ title: 'a', inbox: true, createdAt: 1 });
    const b = makeTask({ title: 'b', inbox: true, createdAt: 2 });
    expect(inboxView([a, b, makeTask()]).map((t) => t.title)).toEqual(['b', 'a']);
  });

  it('summarizes the state of the office', () => {
    const tasks = [
      makeTask({ dueDate: '2026-09-01' }),
      makeTask({ status: 'waiting', statusChangedAt: ts('2026-09-01'), dueDate: TODAY }),
      makeTask({ status: 'waiting', statusChangedAt: ts('2026-09-12') }),
      makeTask({ inbox: true }),
      makeTask({ status: 'done' }),
    ];
    expect(snapshot(tasks, TODAY)).toEqual({
      open: 4,
      overdue: 1,
      waiting: 2,
      waitingOverWeek: 1,
      nudges: 1,
      inbox: 1,
    });
  });
});
