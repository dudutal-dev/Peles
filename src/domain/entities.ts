import type { Contact, Meeting, OrgEvent, Task } from './types';

export interface EntityIndex {
  meetings: Map<string, Meeting>;
  events: Map<string, OrgEvent>;
  contacts: Map<string, Contact>;
}

export function buildEntityIndex(
  meetings: readonly Meeting[],
  events: readonly OrgEvent[],
  contacts: readonly Contact[],
): EntityIndex {
  return {
    meetings: new Map(meetings.map((m) => [m.id, m])),
    events: new Map(events.map((e) => [e.id, e])),
    contacts: new Map(contacts.map((c) => [c.id, c])),
  };
}

export const EMPTY_INDEX: EntityIndex = buildEntityIndex([], [], []);

/** שם ההקשר להצגה: אם המשימה מקושרת לישות, השם העדכני שלה גובר על הטקסט השמור. */
export function contextLabel(task: Task, index: EntityIndex): string {
  const ctx = task.context;
  if (!ctx) return '';
  if (ctx.refId) {
    const entity =
      ctx.kind === 'meeting'
        ? index.meetings.get(ctx.refId)
        : ctx.kind === 'event'
          ? index.events.get(ctx.refId)
          : ctx.kind === 'contact'
            ? index.contacts.get(ctx.refId)
            : undefined;
    if (entity && entity.deletedAt === null) return 'title' in entity ? entity.title : entity.name;
  }
  return ctx.label.trim();
}
