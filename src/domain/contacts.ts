import { newId, isOpen } from './task';
import type { Contact, ContactType, ISODate, Task, Timestamp } from './types';
import { daysWaiting, isOverdue } from './views';

export interface NewContactInput {
  name: string;
  type?: ContactType;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export function createContact(input: NewContactInput, now: Timestamp = Date.now()): Contact {
  return {
    id: newId(),
    name: input.name.trim(),
    type: input.type ?? 'other',
    role: input.role?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    email: input.email?.trim() ?? '',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** השוואת שמות סלחנית: "קבלן א. כהן" = "קבלן א כהן", בלי תלות בגרשיים ורווחים. */
export function normalizeName(s: string): string {
  return s
    .replace(/["'״׳.]/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function taskMatchesContact(t: Task, c: Contact): boolean {
  if (t.context?.kind === 'contact') {
    if (t.context.refId === c.id) return true;
    if (t.context.refId === null && normalizeName(t.context.label) === normalizeName(c.name)) return true;
  }
  return t.owner.kind === 'external' && t.owner.name.trim() !== '' && normalizeName(t.owner.name) === normalizeName(c.name);
}

export function contactTasks(tasks: readonly Task[], c: Contact): Task[] {
  return tasks.filter((t) => t.deletedAt === null && taskMatchesContact(t, c));
}

export interface ContactSummary {
  contact: Contact;
  open: number;
  waiting: number;
  overdue: number;
  /** כמה ימים ממתין הפריט הוותיק ביותר מול הגורם. */
  oldestWaitingDays: number | null;
}

const collator = new Intl.Collator('he');

export function contactSummaries(contacts: readonly Contact[], tasks: readonly Task[], today: ISODate): ContactSummary[] {
  return contacts
    .filter((c) => c.deletedAt === null)
    .map((contact) => {
      const related = contactTasks(tasks, contact).filter(isOpen);
      const waitingTasks = related.filter((t) => t.status === 'waiting');
      return {
        contact,
        open: related.length,
        waiting: waitingTasks.length,
        overdue: related.filter((t) => isOverdue(t, today)).length,
        oldestWaitingDays: waitingTasks.length ? Math.max(...waitingTasks.map((t) => daysWaiting(t, today))) : null,
      };
    })
    .sort((a, b) => b.open - a.open || collator.compare(a.contact.name, b.contact.name));
}

/** שמות שמופיעים במשימות פתוחות (גורם אחראי או הקשר "גורם") ועוד לא נשמרו כגורם. */
export function unsavedContactNames(contacts: readonly Contact[], tasks: readonly Task[]): Array<{ name: string; open: number }> {
  const known = new Set(contacts.filter((c) => c.deletedAt === null).map((c) => normalizeName(c.name)));
  const found = new Map<string, { name: string; open: number }>();

  for (const t of tasks) {
    if (!isOpen(t)) continue;
    const names: string[] = [];
    if (t.owner.kind === 'external' && t.owner.name.trim()) names.push(t.owner.name.trim());
    if (t.context?.kind === 'contact' && t.context.refId === null && t.context.label.trim()) names.push(t.context.label.trim());
    for (const name of names) {
      const key = normalizeName(name);
      if (known.has(key)) continue;
      const entry = found.get(key) ?? { name, open: 0 };
      entry.open += 1;
      found.set(key, entry);
    }
  }
  return [...found.values()].sort((a, b) => b.open - a.open || collator.compare(a.name, b.name));
}
