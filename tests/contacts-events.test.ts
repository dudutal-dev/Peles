import { describe, expect, it } from 'vitest';
import { contactSummaries, createContact, normalizeName, taskMatchesContact, unsavedContactNames } from '../src/domain/contacts';
import { buildEntityIndex, contextLabel } from '../src/domain/entities';
import {
  EVENT_TEMPLATES,
  budgetSummary,
  checklistItems,
  createEvent,
  eventProgress,
  missingTemplateItems,
  plannedAttendance,
  upcomingEvents,
} from '../src/domain/events';
import { startOfDayTs } from '../src/domain/dates';
import type { OrgEvent } from '../src/domain/types';
import { makeTask, TODAY } from './helpers';

describe('contacts', () => {
  const cohen = { ...createContact({ name: 'קבלן א. כהן', type: 'contractor' }), id: 'c1' };

  it('matches names loosely', () => {
    expect(normalizeName('קבלן א. כהן')).toBe(normalizeName('קבלן  א כהן'));
    expect(normalizeName('משרד "לוי"')).toBe(normalizeName('משרד לוי'));
  });

  it('finds tasks by owner name, linked context, or context label', () => {
    expect(taskMatchesContact(makeTask({ owner: { kind: 'external', name: 'קבלן א כהן' } }), cohen)).toBe(true);
    expect(taskMatchesContact(makeTask({ context: { kind: 'contact', label: 'שם ישן', refId: 'c1' } }), cohen)).toBe(true);
    expect(taskMatchesContact(makeTask({ context: { kind: 'contact', label: 'קבלן א. כהן', refId: null } }), cohen)).toBe(true);
    expect(taskMatchesContact(makeTask({ context: { kind: 'project', label: 'קבלן א. כהן', refId: null } }), cohen)).toBe(false);
    expect(taskMatchesContact(makeTask({ owner: { kind: 'me', name: '' } }), cohen)).toBe(false);
  });

  it('summarizes what is open with each contact', () => {
    const tasks = [
      makeTask({ owner: { kind: 'external', name: 'קבלן א. כהן' }, status: 'waiting', statusChangedAt: startOfDayTs('2026-09-02') }),
      makeTask({ owner: { kind: 'external', name: 'קבלן א. כהן' }, status: 'waiting', statusChangedAt: startOfDayTs('2026-09-10'), dueDate: '2026-09-12' }),
      makeTask({ owner: { kind: 'external', name: 'קבלן א. כהן' }, status: 'done' }),
    ];
    const [summary] = contactSummaries([cohen], tasks, TODAY);
    expect(summary).toMatchObject({ open: 2, waiting: 2, overdue: 1, oldestWaitingDays: 12 });
  });

  it('suggests names that appear in tasks but are not saved', () => {
    const tasks = [
      makeTask({ owner: { kind: 'external', name: 'מחוז דרום' } }),
      makeTask({ owner: { kind: 'external', name: 'מחוז דרום' } }),
      makeTask({ context: { kind: 'contact', label: 'אגף רכש', refId: null } }),
      makeTask({ owner: { kind: 'external', name: 'קבלן א כהן' } }),
      makeTask({ owner: { kind: 'external', name: 'סגור' }, status: 'done' }),
    ];
    expect(unsavedContactNames([cohen], tasks)).toEqual([
      { name: 'מחוז דרום', open: 2 },
      { name: 'אגף רכש', open: 1 },
    ]);
  });
});

describe('events', () => {
  it('names a new event after its type by default', () => {
    expect(createEvent({ type: 'farewell' }).title).toBe('אירוע פרידה');
    expect(createEvent({ type: 'farewell', title: 'פרידה מרפי' }).title).toBe('פרידה מרפי');
  });

  it('builds a dated checklist on the template schedule when there is enough time', () => {
    const items = checklistItems(EVENT_TEMPLATES.farewell, '2026-11-01', TODAY); // 48 ימים, התבנית צריכה 30
    expect(items).toHaveLength(EVENT_TEMPLATES.farewell.length);
    // 2.10 הוא שישי ו-31.10 שבת: שניהם מוקדמים ליום חמישי
    expect(items[0]).toEqual({ title: EVENT_TEMPLATES.farewell[0]?.title, dueDate: '2026-10-01' });
    expect(items.at(-1)?.dueDate).toBe('2026-10-29');
    expect(items.every((i) => i.dueDate === null || ![5, 6].includes(new Date(`${i.dueDate}T12:00:00Z`).getUTCDay()))).toBe(true);
    expect(checklistItems(EVENT_TEMPLATES.farewell, null, TODAY).every((i) => i.dueDate === null)).toBe(true);
  });

  it('compresses the schedule when the event is close, instead of piling everything on today', () => {
    // פרידה בעוד 16 יום, תבנית של 30 יום
    const items = checklistItems(EVENT_TEMPLATES.farewell, '2026-09-30', TODAY);
    const dueToday = items.filter((i) => i.dueDate === TODAY);
    expect(dueToday).toHaveLength(1);
    expect(items.every((i) => i.dueDate !== null && i.dueDate >= TODAY && i.dueDate <= '2026-09-30')).toBe(true);
    const dates = items.map((i) => i.dueDate ?? '');
    expect([...dates].sort()).toEqual(dates); // הסדר נשמר
  });

  it('keeps post-event items after the event, and clamps past dates to today', () => {
    const conf = checklistItems(EVENT_TEMPLATES.conference, '2026-09-15', TODAY);
    expect(conf.at(-1)?.dueDate).toBe('2026-09-17'); // 3 ימים אחרי = שישי 18.9 → חמישי
    expect(conf.slice(0, -1).every((i) => i.dueDate === TODAY || i.dueDate === '2026-09-15')).toBe(true);
  });

  it('plans for 85% attendance', () => {
    expect(plannedAttendance(40)).toBe(34);
    expect(plannedAttendance(1)).toBe(1);
    expect(plannedAttendance(null)).toBeNull();
  });

  it('calculates all three budget models', () => {
    const base = { expectedAttendees: 40 };
    expect(budgetSummary({ ...base, budget: { model: 'perHead', perHead: 250, total: null, orgShare: null, selfShare: null } })).toMatchObject({
      planned: 34,
      perHead: 250,
      total: 8500,
    });
    expect(budgetSummary({ ...base, budget: { model: 'lumpSum', perHead: null, total: 10200, orgShare: null, selfShare: null } })).toMatchObject({
      perHead: 300,
      total: 10200,
    });
    expect(budgetSummary({ ...base, budget: { model: 'combined', perHead: null, total: null, orgShare: 200, selfShare: 100 } })).toMatchObject({
      orgPerHead: 200,
      selfPerHead: 100,
      perHead: 300,
      total: 10200,
    });
    expect(budgetSummary({ expectedAttendees: null, budget: { model: 'perHead', perHead: 250, total: null, orgShare: null, selfShare: null } }).total).toBeNull();
  });

  it('tracks progress and missing template items', () => {
    const event: OrgEvent = { ...createEvent({ type: 'onboarding' }), id: 'e1' };
    const ctx = { kind: 'event' as const, label: '', refId: 'e1' };
    const tasks = [
      makeTask({ title: EVENT_TEMPLATES.onboarding[0]?.title ?? '', context: ctx, status: 'done' }),
      makeTask({ title: EVENT_TEMPLATES.onboarding[1]?.title ?? '', context: ctx }),
      makeTask({ title: 'פריט שלי', context: ctx }),
    ];
    expect(eventProgress(tasks, 'e1')).toEqual({ done: 1, total: 3 });
    expect(missingTemplateItems(event, tasks)).toHaveLength(EVENT_TEMPLATES.onboarding.length - 2);
  });

  it('lists upcoming planned events by date', () => {
    const e = (id: string, targetDate: string | null, status: OrgEvent['status'] = 'planning') => ({ ...createEvent({ type: 'other', targetDate }), id, status });
    const list = upcomingEvents([e('far', '2026-12-01'), e('b', '2026-09-30'), e('a', '2026-09-20'), e('undated', null), e('done', '2026-09-18', 'done')], TODAY);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'undated']);
  });
});

describe('context labels', () => {
  it('prefers the live entity name over the stored label', () => {
    const event: OrgEvent = { ...createEvent({ type: 'farewell', title: 'פרידה מרפי' }), id: 'e1' };
    const index = buildEntityIndex([], [event], []);
    const t = makeTask({ context: { kind: 'event', label: 'שם ישן', refId: 'e1' } });
    expect(contextLabel(t, index)).toBe('פרידה מרפי');
    expect(contextLabel(makeTask({ context: { kind: 'project', label: ' מרפאת חולון ', refId: null } }), index)).toBe('מרפאת חולון');
  });
});
