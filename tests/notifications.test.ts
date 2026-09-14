import { describe, expect, it } from 'vitest';
import { startOfDayTs } from '../src/domain/dates';
import { createMeeting } from '../src/domain/meetings';
import {
  DEFAULT_PUSH_SETTINGS,
  composeNotification,
  computePushSchedule,
  eveningHasContent,
  morningHasContent,
} from '../src/domain/notifications';
import { makeTask, TODAY } from './helpers';

/** יום שני 14.9.2026, 06:00 שעון מקומי */
const EARLY = new Date(2026, 8, 14, 6, 0);

describe('push schedule', () => {
  it('stays silent when there is nothing to report', () => {
    expect(computePushSchedule([], [], DEFAULT_PUSH_SETTINGS, EARLY)).toEqual([]);
    expect(computePushSchedule([makeTask({ dueDate: '2026-12-01' })], [], DEFAULT_PUSH_SETTINGS, EARLY)).toEqual([]);
  });

  it('wakes the phone the evening before a waiting item is due, and every morning it is pending', () => {
    // הקבלן התחייב עד חמישי 17.9; תזכורת יום לפני
    const t = makeTask({
      status: 'waiting',
      owner: { kind: 'external', name: 'קבלן כהן' },
      dueDate: '2026-09-17',
      reminder: { daysBefore: 1, repeatDailyWhenOverdue: false },
    });
    const schedule = computePushSchedule([t], [], DEFAULT_PUSH_SETTINGS, EARLY, 7);
    const readable = schedule.map((e) => `${new Date(e.at).getDate()}.${new Date(e.at).getMonth() + 1} ${new Date(e.at).getHours()}:${String(new Date(e.at).getMinutes()).padStart(2, '0')} ${e.kind}`);
    expect(readable).toContain('16.9 17:00 evening');
    expect(readable).toContain('16.9 7:30 morning');
    expect(readable).toContain('17.9 7:30 morning');
    expect(readable).not.toContain('14.9 7:30 morning');
    // שישי-שבת אינם ימי עבודה. ביום ראשון, אחרי המועד ובלי חזרה יומית:
    // אין תזכורת ערב, אבל בבוקר הפריט מופיע כחורג
    expect(readable.some((r) => r.startsWith('18.9') || r.startsWith('19.9'))).toBe(false);
    expect(readable).toContain('20.9 7:30 morning');
    expect(readable).not.toContain('20.9 17:00 evening');
  });

  it('respects work days, disabled slots and times already past', () => {
    const overdue = makeTask({ dueDate: '2026-09-10' });
    const noon = new Date(2026, 8, 14, 12, 0);
    const schedule = computePushSchedule([overdue], [], { ...DEFAULT_PUSH_SETTINGS, evening: false }, noon, 7);
    const days = schedule.map((e) => new Date(e.at).getDate());
    expect(days).toEqual([15, 16, 17, 20]); // שני בצהריים: 14 עבר; שישי-שבת לא ימי עבודה
    expect(schedule.every((e) => e.kind === 'morning')).toBe(true);
  });

  it('counts meetings as a reason for a morning notification', () => {
    const m = createMeeting({ title: 'ישיבה', date: '2026-09-15' });
    expect(morningHasContent([], [m], '2026-09-15')).toBe(true);
    expect(morningHasContent([], [m], TODAY)).toBe(false);
  });

  it('looks at tomorrow for the evening slot', () => {
    expect(eveningHasContent([makeTask({ dueDate: '2026-09-15' })], TODAY)).toBe(true);
    expect(eveningHasContent([makeTask({ dueDate: '2026-09-16' })], TODAY)).toBe(false);
  });
});

describe('notification text', () => {
  it('summarizes the morning', () => {
    const tasks = [
      makeTask({ title: 'תכניות לאגף', dueDate: '2026-09-10' }),
      makeTask({ status: 'waiting', dueDate: TODAY, statusChangedAt: startOfDayTs('2026-09-01') }),
    ];
    const meetings = [createMeeting({ title: 'ישיבה', date: TODAY })];
    const n = composeNotification('morning', tasks, meetings, TODAY);
    expect(n.title).toBe('סדר היום');
    expect(n.body).toBe('1 באיחור, 1 לנדנד, ישיבה אחת היום. ראשון בתור: תכניות לאגף');
  });

  it('names who owes what in the evening', () => {
    const t = makeTask({ title: 'אישור בטיחות אש', status: 'waiting', owner: { kind: 'external', name: 'קבלן כהן' }, dueDate: '2026-09-15' });
    expect(composeNotification('evening', [t], [], TODAY).body).toBe('מחר המועד: אישור בטיחות אש (קבלן כהן)');
  });

  it('always returns visible content, even when nothing is pending', () => {
    expect(composeNotification('morning', [], [], TODAY).body).toContain('אין איחורים');
    expect(composeNotification('evening', [], [], TODAY).body).toContain('הכל בזמן');
    expect(composeNotification('test', [], [], TODAY).body).toContain('ההתראות עובדות');
  });
});
