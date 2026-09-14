import { describe, expect, it } from 'vitest';
import { applyTaskPatch, createTask, normalizeTags } from '../src/domain/task';

describe('task model', () => {
  it('defaults to a todo owned by me, from a direct request', () => {
    const t = createTask({ title: '  לתאם סיור  ' }, 1000);
    expect(t).toMatchObject({
      title: 'לתאם סיור',
      status: 'todo',
      owner: { kind: 'me', name: '' },
      source: { kind: 'direct' },
      inbox: false,
      createdAt: 1000,
      statusChangedAt: 1000,
      completedAt: null,
      deletedAt: null,
    });
  });

  it('treats a task owned by an external party as waiting', () => {
    const t = createTask({ title: 'אישור', owner: { kind: 'external', name: 'כהן' } });
    expect(t.status).toBe('waiting');
  });

  it('records completion time and clears it on reopen', () => {
    const t = createTask({ title: 'x' }, 1000);
    const done = applyTaskPatch(t, { status: 'done' }, 2000);
    expect(done.completedAt).toBe(2000);
    expect(done.statusChangedAt).toBe(2000);
    const reopened = applyTaskPatch(done, { status: 'todo' }, 3000);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.statusChangedAt).toBe(3000);
  });

  it('does not reset "waiting since" when other fields change', () => {
    const t = createTask({ title: 'x', status: 'waiting' }, 1000);
    const edited = applyTaskPatch(t, { notes: 'התקשרתי שוב' }, 5000);
    expect(edited.statusChangedAt).toBe(1000);
    expect(edited.updatedAt).toBe(5000);
  });

  it('moves a todo to waiting when handed to an external party', () => {
    const t = createTask({ title: 'x' }, 1000);
    const handed = applyTaskPatch(t, { owner: { kind: 'external', name: 'מחוז צפון' } }, 2000);
    expect(handed.status).toBe('waiting');
    expect(handed.statusChangedAt).toBe(2000);
  });

  it('respects an explicit status when changing owner', () => {
    const t = createTask({ title: 'x' }, 1000);
    const r = applyTaskPatch(t, { owner: { kind: 'external', name: 'יועץ' }, status: 'verify' }, 2000);
    expect(r.status).toBe('verify');
  });

  it('keeps the old title when a blank one is saved', () => {
    const t = createTask({ title: 'כותרת' });
    expect(applyTaskPatch(t, { title: '   ' }).title).toBe('כותרת');
  });

  it('normalizes tags', () => {
    expect(normalizeTags(['#בטיחות', 'בטיחות', ' מחוז דן ', ''])).toEqual(['בטיחות', 'מחוז דן']);
  });
});
