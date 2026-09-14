import { addDays, daysSince } from './dates';
import { CONTEXT_LABEL } from './labels';
import { isOpen } from './task';
import type { ContextKind, ISODate, Task, Timestamp } from './types';

export function isOverdue(t: Task, today: ISODate): boolean {
  return isOpen(t) && t.dueDate !== null && t.dueDate < today;
}

export function isDueToday(t: Task, today: ISODate): boolean {
  return isOpen(t) && t.dueDate === today;
}

/**
 * פריט שממתין לתגובה נכנס ל"לנדנד" כשמגיע חלון התזכורת לפני המועד,
 * ונשאר שם אחרי המועד רק אם הוגדרה חזרה יומית.
 */
export function needsNudge(t: Task, today: ISODate): boolean {
  if (!isOpen(t) || t.status !== 'waiting' || t.dueDate === null) return false;
  const from = addDays(t.dueDate, -Math.max(0, t.reminder.daysBefore));
  if (today < from) return false;
  if (today <= t.dueDate) return true;
  return t.reminder.repeatDailyWhenOverdue;
}

export function daysWaiting(t: Task, today: ISODate): number {
  return daysSince(t.statusChangedAt, today);
}

/** ככל שהמספר קטן יותר, הפריט דחוף יותר. */
function todayRank(t: Task, today: ISODate): number {
  if (isOverdue(t, today)) return 0;
  if (t.directorAwaits) return 1;
  if (isDueToday(t, today)) return 2;
  if (t.urgent) return 3;
  if (needsNudge(t, today)) return 4;
  return 5;
}

function byDueThenCreated(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

/** תצוגת "היום": מה על הפרק עכשיו. */
export function todayView(tasks: readonly Task[], today: ISODate): Task[] {
  return tasks
    .filter(
      (t) =>
        isOpen(t) &&
        !t.inbox &&
        ((t.dueDate !== null && t.dueDate <= today) ||
          t.urgent ||
          t.directorAwaits ||
          needsNudge(t, today)),
    )
    .sort((a, b) => todayRank(a, today) - todayRank(b, today) || byDueThenCreated(a, b));
}

/** פריטים שנקלטו מהר ומחכים להשלמת פרטים. */
export function inboxView(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => isOpen(t) && t.inbox).sort((a, b) => b.createdAt - a.createdAt);
}

/** "ממתין למישהו אחר": ממוין לפי כמה זמן זה תקוע, לא לפי תאריך יעד. */
export function waitingView(tasks: readonly Task[]): Task[] {
  return tasks
    .filter((t) => isOpen(t) && t.status === 'waiting')
    .sort((a, b) => a.statusChangedAt - b.statusChangedAt);
}

/** "תקוע/חורג": כל מה שעבר את תאריך היעד, הוותיק ביותר קודם. */
export function overdueView(tasks: readonly Task[], today: ISODate): Task[] {
  return tasks.filter((t) => isOverdue(t, today)).sort(byDueThenCreated);
}

export interface TaskGroup {
  key: string;
  title: string;
  subtitle: string;
  tasks: Task[];
  overdueCount: number;
}

const collator = new Intl.Collator('he');

/** "לפי הקשר": משימות פתוחות מקובצות לפי הפרויקט/הגורם שהן שייכות אליו. */
export function contextGroups(tasks: readonly Task[], today: ISODate): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const loose: Task[] = [];

  for (const t of tasks) {
    if (!isOpen(t)) continue;
    if (t.context === null || t.context.label.trim() === '') {
      loose.push(t);
      continue;
    }
    const key = `${t.context.kind}:${t.context.label.trim()}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        title: t.context.label.trim(),
        subtitle: CONTEXT_LABEL[t.context.kind],
        tasks: [],
        overdueCount: 0,
      };
      groups.set(key, g);
    }
    g.tasks.push(t);
    if (isOverdue(t, today)) g.overdueCount += 1;
  }

  const sorted = [...groups.values()]
    .map((g) => ({ ...g, tasks: g.tasks.sort(byDueThenCreated) }))
    .sort(
      (a, b) =>
        b.overdueCount - a.overdueCount ||
        b.tasks.length - a.tasks.length ||
        collator.compare(a.title, b.title),
    );

  if (loose.length > 0) {
    sorted.push({
      key: 'none',
      title: 'בלי הקשר',
      subtitle: '',
      tasks: loose.sort(byDueThenCreated),
      overdueCount: loose.filter((t) => isOverdue(t, today)).length,
    });
  }
  return sorted;
}

/** מקבץ פריטים ממתינים לפי שם הגורם שאחראי להם. */
export function waitingByOwner(tasks: readonly Task[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const t of waitingView(tasks)) {
    const name =
      t.owner.kind === 'director'
        ? 'ראש המינהל'
        : t.owner.name.trim() || (t.context?.kind === 'contact' ? t.context.label : '') || 'לא צוין גורם';
    let g = groups.get(name);
    if (!g) {
      g = { key: name, title: name, subtitle: '', tasks: [], overdueCount: 0 };
      groups.set(name, g);
    }
    g.tasks.push(t);
  }
  return [...groups.values()].sort(
    (a, b) => b.tasks.length - a.tasks.length || collator.compare(a.title, b.title),
  );
}

/** מסיר ניקוד וטעמים כדי שחיפוש לא ייכשל בגללם. */
function normalize(s: string): string {
  return s.replace(/[֑-ׇ]/g, '').toLowerCase();
}

export function taskMatches(t: Task, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalize(
    [t.title, t.notes, t.owner.name, t.context?.label ?? '', t.source.label, ...t.tags].join(' '),
  );
  return words.every((w) => hay.includes(w));
}

/** חיפוש בכל המשימות, פתוחות קודם. */
export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  return tasks
    .filter((t) => t.deletedAt === null && taskMatches(t, query))
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.updatedAt - a.updatedAt);
}

export function filterByTag(tasks: readonly Task[], tag: string | null): Task[] {
  return tag === null ? [...tasks] : tasks.filter((t) => t.tags.includes(tag));
}

export function recentlyDone(tasks: readonly Task[], now: Timestamp, days = 7): Task[] {
  const since = now - days * 86_400_000;
  return tasks
    .filter((t) => t.deletedAt === null && t.status === 'done' && (t.completedAt ?? 0) >= since)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

export function openTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter(isOpen).sort(byDueThenCreated);
}

/** תגיות לפי שכיחות במשימות פתוחות. */
export function tagCounts(tasks: readonly Task[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.tag, b.tag));
}

/** ערכים קודמים להשלמה אוטומטית בשדות טקסט חופשי. */
export function knownValues(tasks: readonly Task[]): {
  owners: string[];
  tags: string[];
  contexts: Record<ContextKind, string[]>;
  meetings: string[];
} {
  const owners = new Set<string>();
  const tags = new Set<string>();
  const meetings = new Set<string>();
  const contexts: Record<ContextKind, Set<string>> = {
    project: new Set(),
    contact: new Set(),
    meeting: new Set(),
    event: new Set(),
  };
  for (const t of tasks) {
    if (t.deletedAt !== null) continue;
    if (t.owner.name.trim()) owners.add(t.owner.name.trim());
    t.tags.forEach((tag) => tags.add(tag));
    if (t.context && t.context.label.trim()) contexts[t.context.kind].add(t.context.label.trim());
    if (t.source.label.trim()) meetings.add(t.source.label.trim());
  }
  const sort = (s: Set<string>) => [...s].sort(collator.compare);
  return {
    owners: sort(owners),
    tags: sort(tags),
    meetings: sort(meetings),
    contexts: {
      project: sort(contexts.project),
      contact: sort(contexts.contact),
      meeting: sort(contexts.meeting),
      event: sort(contexts.event),
    },
  };
}

export interface Snapshot {
  open: number;
  overdue: number;
  waiting: number;
  waitingOverWeek: number;
  nudges: number;
  inbox: number;
}

export function snapshot(tasks: readonly Task[], today: ISODate): Snapshot {
  let open = 0;
  let overdue = 0;
  let waiting = 0;
  let waitingOverWeek = 0;
  let nudges = 0;
  let inbox = 0;
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    open += 1;
    if (isOverdue(t, today)) overdue += 1;
    if (t.status === 'waiting') {
      waiting += 1;
      if (daysWaiting(t, today) >= 7) waitingOverWeek += 1;
    }
    if (needsNudge(t, today)) nudges += 1;
    if (t.inbox) inbox += 1;
  }
  return { open, overdue, waiting, waitingOverWeek, nudges, inbox };
}
