import { describe, expect, it } from 'vitest';
import {
  addDays,
  describeDue,
  diffDays,
  endOfWorkWeek,
  nextWeekday,
  startOfNextWeek,
  weekStart,
  weekday,
} from '../src/domain/dates';
import { TODAY } from './helpers';

describe('dates', () => {
  it('knows 2026-09-14 is a Monday', () => {
    expect(weekday(TODAY)).toBe(1);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days across daylight-saving changes', () => {
    // שעון חורף בישראל מתחלף בסוף אוקטובר
    expect(diffDays('2026-10-20', '2026-10-30')).toBe(10);
    expect(diffDays('2026-03-20', '2026-03-30')).toBe(10);
  });

  it('finds week start (Sunday), next weekday, end of work week', () => {
    expect(weekStart(TODAY)).toBe('2026-09-13');
    expect(nextWeekday(TODAY, 4)).toBe('2026-09-17');
    expect(nextWeekday(TODAY, 1)).toBe('2026-09-21');
    expect(endOfWorkWeek(TODAY)).toBe('2026-09-17');
    expect(endOfWorkWeek('2026-09-18')).toBe('2026-09-24');
    expect(startOfNextWeek(TODAY)).toBe('2026-09-20');
  });

  it('describes due dates relative to today', () => {
    expect(describeDue('2026-09-11', TODAY)).toEqual({ text: 'באיחור 3 ימים', tone: 'overdue' });
    expect(describeDue('2026-09-13', TODAY)).toEqual({ text: 'באיחור יום אחד', tone: 'overdue' });
    expect(describeDue(TODAY, TODAY)).toEqual({ text: 'היום', tone: 'today' });
    expect(describeDue('2026-09-15', TODAY)).toEqual({ text: 'מחר', tone: 'soon' });
    expect(describeDue('2026-09-17', TODAY)).toEqual({ text: 'יום חמישי', tone: 'soon' });
    expect(describeDue('2026-10-02', TODAY)).toEqual({ text: '2.10', tone: 'later' });
    expect(describeDue('2027-01-05', TODAY).text).toBe('5.1.27');
  });
});
