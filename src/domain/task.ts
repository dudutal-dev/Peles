import type {
  ISODate,
  Owner,
  ReminderRule,
  Task,
  TaskContext,
  TaskSource,
  TaskStatus,
  Timestamp,
} from './types';

export const DEFAULT_REMINDER: ReminderRule = { daysBefore: 1, repeatDailyWhenOverdue: true };

export interface NewTaskInput {
  title: string;
  notes?: string;
  status?: TaskStatus;
  owner?: Owner;
  dueDate?: ISODate | null;
  reminder?: ReminderRule;
  urgent?: boolean;
  directorAwaits?: boolean;
  tags?: string[];
  context?: TaskContext | null;
  source?: TaskSource;
  inbox?: boolean;
}

/** שדות שמותר לשנות במשימה קיימת. */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'notes'
    | 'status'
    | 'owner'
    | 'dueDate'
    | 'reminder'
    | 'urgent'
    | 'directorAwaits'
    | 'tags'
    | 'context'
    | 'source'
    | 'inbox'
  >
>;

export function newId(): string {
  const c = globalThis.crypto;
  // randomUUID זמין רק בהקשר מאובטח (https / localhost)
  if (typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* נופלים לחלופה */
    }
  }
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.replace(/^#/, '').trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function createTask(input: NewTaskInput, now: Timestamp = Date.now()): Task {
  const owner: Owner = input.owner ?? { kind: 'me', name: '' };
  const status: TaskStatus = input.status ?? (owner.kind === 'external' ? 'waiting' : 'todo');
  return {
    id: newId(),
    title: input.title.trim(),
    notes: input.notes ?? '',
    status,
    owner,
    dueDate: input.dueDate ?? null,
    reminder: input.reminder ?? DEFAULT_REMINDER,
    urgent: input.urgent ?? false,
    directorAwaits: input.directorAwaits ?? false,
    tags: normalizeTags(input.tags ?? []),
    context: input.context ?? null,
    source: input.source ?? { kind: 'direct', label: '', refId: null },
    inbox: input.inbox ?? false,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    completedAt: status === 'done' ? now : null,
    deletedAt: null,
  };
}

/**
 * מחיל שינוי על משימה ומחזיר משימה חדשה. מטפל בכללים הנגזרים:
 * זמן שינוי סטטוס, זמן השלמה, והעברה אוטומטית ל"ממתין" כשהאחריות עוברת לגורם אחר.
 */
export function applyTaskPatch(task: Task, patch: TaskPatch, now: Timestamp = Date.now()): Task {
  const next: Task = { ...task, ...patch, updatedAt: now };

  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  if (patch.title !== undefined) next.title = patch.title.trim() || task.title;

  // אחריות עברה לגורם אחר ולא נבחר סטטוס במפורש — זה פריט שממתין לתגובה.
  if (
    patch.owner !== undefined &&
    patch.status === undefined &&
    patch.owner.kind === 'external' &&
    task.owner.kind !== 'external' &&
    task.status === 'todo'
  ) {
    next.status = 'waiting';
  }

  if (next.status !== task.status) {
    next.statusChangedAt = now;
    next.completedAt = next.status === 'done' ? now : null;
  }

  return next;
}

export function isOpen(t: Task): boolean {
  return t.status !== 'done' && t.deletedAt === null;
}
