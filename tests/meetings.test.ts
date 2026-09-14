import { describe, expect, it } from 'vitest';
import {
  applyBucket,
  bucketOf,
  createMeeting,
  meetingLists,
  meetingSummaryText,
  meetingTasks,
  meetingsOn,
  parseCommitment,
} from '../src/domain/meetings';
import type { Meeting } from '../src/domain/types';
import { makeTask, TODAY } from './helpers';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return { ...createMeeting({ title: 'ישיבת סטטוס', date: TODAY }, 1000), ...overrides };
}

describe('meetings', () => {
  it('lists a day by time, untimed last, ignoring deleted', () => {
    const list = [
      meeting({ id: 'c', time: '' }),
      meeting({ id: 'b', time: '13:00' }),
      meeting({ id: 'a', time: '08:30' }),
      meeting({ id: 'd', time: '08:00', date: '2026-09-15' }),
      meeting({ id: 'e', time: '07:00', deletedAt: 5 }),
    ];
    expect(meetingsOn(list, TODAY).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('links tasks both ways: by source and by context', () => {
    const m = meeting({ id: 'm1' });
    const fromSource = makeTask({ title: 'a', source: { kind: 'meeting', label: 'x', refId: 'm1' }, createdAt: 1 });
    const fromContext = makeTask({ title: 'b', context: { kind: 'meeting', label: 'x', refId: 'm1' }, createdAt: 2 });
    const other = makeTask({ title: 'c' });
    expect(meetingTasks([other, fromContext, fromSource], m.id).map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('only asks to summarize past meetings that were actually documented', () => {
    const documented = meeting({ id: 'doc', date: '2026-09-10', notes: 'סוכם על לו"ז' });
    const withTask = meeting({ id: 'task', date: '2026-09-11' });
    const bare = meeting({ id: 'bare', date: '2026-09-12' });
    const closed = meeting({ id: 'closed', date: '2026-09-09', notes: 'x', closedAt: 5 });
    const today = meeting({ id: 'today' });
    const soon = meeting({ id: 'soon', date: '2026-09-20' });
    const tasks = [makeTask({ source: { kind: 'meeting', label: '', refId: 'task' } })];

    const lists = meetingLists([documented, withTask, bare, closed, today, soon], tasks, TODAY);
    expect(lists.toSummarize.map((m) => m.id)).toEqual(['doc', 'task']);
    expect(lists.today.map((m) => m.id)).toEqual(['today']);
    expect(lists.upcoming.map((m) => m.id)).toEqual(['soon']);
    expect(lists.past.map((m) => m.id)).toEqual(['bare', 'closed']);
  });
});

describe('parseCommitment', () => {
  it('turns "@contractor will send X by Thursday" into a waiting item', () => {
    const c = parseCommitment('@קבלן_כהן ישלח אישור בטיחות אש עד יום חמישי', TODAY, 'me');
    expect(c).toMatchObject({
      title: 'ישלח אישור בטיחות אש',
      dueDate: '2026-09-17',
      owner: { kind: 'external', name: 'קבלן כהן' },
      status: 'waiting',
    });
  });

  it('recognizes @אני and @ראש_המינהל', () => {
    expect(parseCommitment('@אני לתאם סיור', TODAY, 'director').owner).toEqual({ kind: 'me', name: '' });
    expect(parseCommitment('@ראש_המינהל לאשר תקציב', TODAY, 'me')).toMatchObject({
      owner: { kind: 'director', name: '' },
      status: 'waiting',
    });
  });

  it('falls back to the owner chosen in the buttons', () => {
    expect(parseCommitment('לשלוח סיכום מחר', TODAY, 'me')).toMatchObject({ status: 'todo', owner: { kind: 'me' } });
    expect(parseCommitment('לאשר את ההצעה', TODAY, 'director')).toMatchObject({ status: 'waiting', owner: { kind: 'director' } });
  });
});

describe('after-meeting split', () => {
  it('classifies and re-assigns items', () => {
    const mine = makeTask({ title: 'mine' });
    expect(bucketOf(mine)).toBe('mine');

    const handed = applyBucket(mine, 'handed', 5000);
    expect(handed).toMatchObject({ status: 'waiting', owner: { kind: 'external', name: '' } });
    expect(bucketOf(handed)).toBe('handed');

    const follow = applyBucket(handed, 'follow', 6000);
    expect(follow.status).toBe('verify');
    expect(bucketOf(follow)).toBe('follow');

    const back = applyBucket(follow, 'mine', 7000);
    expect(back).toMatchObject({ status: 'todo', owner: { kind: 'me' } });
  });

  it('keeps an existing external owner when handing over', () => {
    const t = makeTask({ owner: { kind: 'external', name: 'יועץ' }, status: 'verify' });
    expect(applyBucket(t, 'handed').owner).toEqual({ kind: 'external', name: 'יועץ' });
  });
});

describe('summary text', () => {
  it('produces a shareable summary with owners and due dates', () => {
    const m = meeting({ id: 'm1', time: '10:00', location: 'חדר 4', participants: ['יוסי', 'רונית'], notes: 'להמשיך בשבוע הבא' });
    const tasks = [
      makeTask({ title: 'אישור בטיחות', owner: { kind: 'external', name: 'קבלן כהן' }, dueDate: '2026-09-17', source: { kind: 'meeting', label: '', refId: 'm1' }, createdAt: 1 }),
      makeTask({ title: 'לתאם סיור', source: { kind: 'meeting', label: '', refId: 'm1' }, createdAt: 2 }),
    ];
    const text = meetingSummaryText(m, tasks, TODAY);
    expect(text).toContain('סיכום ישיבה: ישיבת סטטוס');
    expect(text).toContain('10:00, חדר 4');
    expect(text).toContain('משתתפים: יוסי, רונית');
    expect(text).toContain('1. אישור בטיחות | אחריות: קבלן כהן | עד 17.9');
    expect(text).toContain('2. לתאם סיור | אחריות: הלשכה');
    expect(text).toContain('הערות:\nלהמשיך בשבוע הבא');
  });
});
