import { describe, expect, it } from 'vitest';
import { describeRecurrence, periodKey, routineForDay } from '../src/domain/routine';
import type { RoutineCheck, RoutineItem } from '../src/domain/types';
import { TODAY } from './helpers';

function item(id: string, order: number, recurrence: RoutineItem['recurrence']): RoutineItem {
  return { id, title: id, recurrence, order, createdAt: 0, updatedAt: 0, deletedAt: null };
}

describe('routine', () => {
  const daily = item('daily', 1, { kind: 'days', days: [0, 1, 2, 3, 4] });
  const sundayOnly = item('sunday', 2, { kind: 'days', days: [0] });
  const weekly = item('weekly', 3, { kind: 'weekly' });

  it('shows items that apply today, in order', () => {
    const entries = routineForDay([weekly, sundayOnly, daily], [], TODAY);
    expect(entries.map((e) => e.item.id)).toEqual(['daily', 'weekly']);
    expect(routineForDay([weekly, sundayOnly, daily], [], '2026-09-13').map((e) => e.item.id)).toEqual([
      'daily',
      'sunday',
      'weekly',
    ]);
  });

  it('resets daily checks each day, and weekly checks each week', () => {
    const checks: RoutineCheck[] = [
      { id: `${periodKey(daily.recurrence, TODAY)}|daily`, routineItemId: 'daily', periodKey: TODAY, done: true, updatedAt: 0 },
      { id: `W2026-09-13|weekly`, routineItemId: 'weekly', periodKey: 'W2026-09-13', done: true, updatedAt: 0 },
    ];
    const today = routineForDay([daily, weekly], checks, TODAY);
    expect(today.map((e) => e.done)).toEqual([true, true]);

    const tomorrow = routineForDay([daily, weekly], checks, '2026-09-15');
    expect(tomorrow.map((e) => e.done)).toEqual([false, true]);

    const nextWeek = routineForDay([daily, weekly], checks, '2026-09-21');
    expect(nextWeek.map((e) => e.done)).toEqual([false, false]);
  });

  it('treats an unchecked record as not done', () => {
    const checks: RoutineCheck[] = [{ id: `${TODAY}|daily`, routineItemId: 'daily', periodKey: TODAY, done: false, updatedAt: 0 }];
    expect(routineForDay([daily], checks, TODAY)[0]?.done).toBe(false);
  });

  it('hides deleted items', () => {
    expect(routineForDay([{ ...daily, deletedAt: 5 }], [], TODAY)).toEqual([]);
  });

  it('describes recurrence in Hebrew', () => {
    expect(describeRecurrence({ kind: 'days', days: [0, 1, 2, 3, 4] })).toBe('כל יום עבודה');
    expect(describeRecurrence({ kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('כל יום');
    expect(describeRecurrence({ kind: 'days', days: [4, 0] })).toBe('א׳ ה׳');
    expect(describeRecurrence({ kind: 'weekly' })).toBe('פעם בשבוע');
  });
});
