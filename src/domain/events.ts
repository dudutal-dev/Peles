import { addDays, diffDays, weekday } from './dates';
import { EVENT_TYPE_LABEL } from './labels';
import { newId } from './task';
import type { EventBudget, EventType, ISODate, OrgEvent, Task, Timestamp } from './types';

/**
 * תבניות checklist לפי סוג אירוע, בהשראת הסקיל clalit-event-planner
 * (מבני אירועים, מודלי תקציב, דגשים לכללית: כשרות, נגישות, נשירה, שחרור מהעבודה).
 * daysBefore: כמה ימים לפני האירוע כדאי לסיים את הפריט (שלילי = אחרי).
 */
export interface TemplateItem {
  title: string;
  daysBefore: number;
}

export const EVENT_TEMPLATES: Record<EventType, TemplateItem[]> = {
  farewell: [
    { title: 'לתאם תאריך ושעה עם המחלקה ועם העוזב/ת', daysBefore: 30 },
    { title: 'לבחור מקום: פנימי ללא עלות או מסעדה', daysBefore: 21 },
    { title: 'לאשר תקציב ומודל תקציב', daysBefore: 21 },
    { title: 'להזמין קייטרינג או כיבוד כשר', daysBefore: 14 },
    { title: 'לשלוח הזמנות לצוות', daysBefore: 14 },
    { title: 'לאסוף ברכות ותמונות לאלבום או סרטון', daysBefore: 10 },
    { title: 'להזמין מתנה אישית', daysBefore: 10 },
    { title: 'לתאם רגע מילים: מנהל ועוד 2–3 קולגות', daysBefore: 7 },
    { title: 'לאשר מספר מגיעים סופי (תכנון ל-85% הגעה)', daysBefore: 3 },
    { title: 'לוודא הגברה, מקרן וקישוט', daysBefore: 1 },
  ],
  retirement: [
    { title: 'לתאם מועד עם הפורש/ת ועם בני המשפחה', daysBefore: 45 },
    { title: 'לאשר תקציב ומודל תקציב', daysBefore: 40 },
    { title: 'להזמין אולם או מסעדה מכובדת', daysBefore: 35 },
    { title: 'להזמין קייטרינג כשר', daysBefore: 21 },
    { title: 'לשלוח הזמנות להנהלה, לצוות ולמשפחה', daysBefore: 21 },
    { title: 'להזמין צלם', daysBefore: 21 },
    { title: 'להכין מצגת או סרטון על הדרך המקצועית', daysBefore: 14 },
    { title: 'להזמין מתנת פרישה ותעודת הוקרה', daysBefore: 14 },
    { title: 'לתאם נאומים: מנהל בכיר, עמית ותיק והפורש/ת', daysBefore: 10 },
    { title: 'לאשר מספר מגיעים סופי', daysBefore: 3 },
    { title: 'לוודא הגברה ומקרן', daysBefore: 1 },
  ],
  conference: [
    { title: 'להזמין אולם, הגברה ומקרן', daysBefore: 45 },
    { title: 'לבנות תוכנית ולו"ז (הפסקה כל 90 דקות לכל היותר)', daysBefore: 40 },
    { title: 'לתאם דוברים ומרצים', daysBefore: 40 },
    { title: 'לפתוח הרשמה', daysBefore: 30 },
    { title: 'לשלוח הזמנות', daysBefore: 21 },
    { title: 'להזמין קייטרינג והפסקות קפה כשרים', daysBefore: 21 },
    { title: 'לוודא נגישות וחניה', daysBefore: 14 },
    { title: 'להכין חומרים מודפסים או דיגיטליים', daysBefore: 10 },
    { title: 'להכין שילוט', daysBefore: 7 },
    { title: 'לשלוח תזכורת למשתתפים', daysBefore: 3 },
    { title: 'לשלוח סיכום ובקשת משוב', daysBefore: -3 },
  ],
  teamBuilding: [
    { title: 'לבחור אזור ויעד לפי זמן הנסיעה', daysBefore: 45 },
    { title: 'לאשר תקציב ומודל תקציב', daysBefore: 45 },
    { title: 'לתאם שחרור מהעבודה או חלוקה למשמרות', daysBefore: 30 },
    { title: 'להזמין הסעות', daysBefore: 30 },
    { title: 'להזמין פעילות גיבוש משימתית', daysBefore: 30 },
    { title: 'להזמין ארוחות כשרות', daysBefore: 21 },
    { title: 'לבנות לו"ז שעה-שעה', daysBefore: 14 },
    { title: 'הרשמה ואישורי הגעה (תכנון ל-85%)', daysBefore: 14 },
    { title: 'לוודא נגישות וחלופה למי שלא משתתף פיזית', daysBefore: 7 },
    { title: 'תוכנית גיבוי לגשם או לחום', daysBefore: 7 },
  ],
  funDay: [
    { title: 'לבחור יעד ואטרקציה מרכזית', daysBefore: 30 },
    { title: 'לאשר תקציב', daysBefore: 30 },
    { title: 'להזמין הסעות', daysBefore: 21 },
    { title: 'להזמין אוכל כשר', daysBefore: 14 },
    { title: 'אישורי הגעה', daysBefore: 7 },
    { title: 'תוכנית גיבוי למזג האוויר', daysBefore: 5 },
  ],
  teamEvening: [
    { title: 'לתאם תאריך שמתאים לרוב הצוות', daysBefore: 21 },
    { title: 'לבחור מסעדה או מקום', daysBefore: 21 },
    { title: 'להזמין מקום', daysBefore: 14 },
    { title: 'פעילות או הופעה (לא חובה)', daysBefore: 14 },
    { title: 'אישורי הגעה', daysBefore: 5 },
  ],
  recognition: [
    { title: 'לגבש רשימת מוקרים', daysBefore: 30 },
    { title: 'לאשר תקציב', daysBefore: 30 },
    { title: 'להזמין מקום', daysBefore: 21 },
    { title: 'להזמין תעודות או מגנים', daysBefore: 21 },
    { title: 'להזמין צלם', daysBefore: 14 },
    { title: 'להזמין כיבוד כשר', daysBefore: 14 },
    { title: 'לשלוח הזמנות', daysBefore: 14 },
    { title: 'לתאם דברי הוקרה', daysBefore: 7 },
  ],
  onboarding: [
    { title: 'לשריין חדר או מקום פנימי', daysBefore: 10 },
    { title: 'לשלוח הזמנה לצוות', daysBefore: 7 },
    { title: 'להזמין כיבוד', daysBefore: 5 },
    { title: 'לתאם דברי פתיחה', daysBefore: 5 },
    { title: 'להכין סבב היכרות ופעילות שוברת קרח', daysBefore: 3 },
  ],
  other: [],
};

export interface NewEventInput {
  type: EventType;
  title?: string;
  targetDate?: ISODate | null;
  expectedAttendees?: number | null;
}

export const EMPTY_BUDGET: EventBudget = { model: 'none', perHead: null, total: null, orgShare: null, selfShare: null };

export function createEvent(input: NewEventInput, now: Timestamp = Date.now()): OrgEvent {
  const title = input.title?.trim() || EVENT_TYPE_LABEL[input.type];
  return {
    id: newId(),
    title,
    type: input.type,
    targetDate: input.targetDate ?? null,
    expectedAttendees: input.expectedAttendees ?? null,
    budget: EMPTY_BUDGET,
    venue: 'undecided',
    status: 'planning',
    notes: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * תאריכי יעד ל-checklist. כשהאירוע קרוב יותר ממה שהתבנית מניחה (למשל פרידה בעוד 16 יום
 * ותבנית של 30), הלו"ז נדחס באופן יחסי לזמן שנשאר, במקום שכל הפריטים "הוותיקים" ייפלו על היום.
 */
export function checklistItems(
  items: readonly TemplateItem[],
  targetDate: ISODate | null,
  today: ISODate,
): Array<{ title: string; dueDate: ISODate | null }> {
  if (!targetDate) return items.map((item) => ({ title: item.title, dueDate: null }));

  const lead = Math.max(0, diffDays(today, targetDate));
  const span = Math.max(0, ...items.map((i) => i.daysBefore));
  const scale = span > lead && span > 0 ? lead / span : 1;

  return items.map((item) => {
    const before = item.daysBefore > 0 ? Math.round(item.daysBefore * scale) : item.daysBefore;
    let due = addDays(targetDate, -before);
    // שישי-שבת אינם ימי עבודה: מקדימים ליום חמישי
    while (due > today && weekday(due) >= 5) due = addDays(due, -1);
    return { title: item.title, dueDate: due < today ? today : due };
  });
}

export function isEventTask(t: Task, eventId: string): boolean {
  return t.context?.kind === 'event' && t.context.refId === eventId;
}

export function eventTasks(tasks: readonly Task[], eventId: string): Task[] {
  return tasks
    .filter((t) => t.deletedAt === null && isEventTask(t, eventId))
    .sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });
}

export function eventProgress(tasks: readonly Task[], eventId: string): { done: number; total: number } {
  const list = eventTasks(tasks, eventId);
  return { done: list.filter((t) => t.status === 'done').length, total: list.length };
}

/** פריטי תבנית שעוד לא קיימים באירוע (לפי כותרת), למשל אחרי מחיקה או שינוי סוג. */
export function missingTemplateItems(event: OrgEvent, tasks: readonly Task[]): TemplateItem[] {
  const titles = new Set(eventTasks(tasks, event.id).map((t) => t.title.trim()));
  return EVENT_TEMPLATES[event.type].filter((item) => !titles.has(item.title));
}

export function upcomingEvents(events: readonly OrgEvent[], today: ISODate, horizonDays = 30): OrgEvent[] {
  const horizon = addDays(today, horizonDays);
  return events
    .filter((e) => e.deletedAt === null && e.status === 'planning' && (e.targetDate === null || e.targetDate <= horizon))
    .sort((a, b) => {
      if (a.targetDate === b.targetDate) return a.createdAt - b.createdAt;
      if (a.targetDate === null) return 1;
      if (b.targetDate === null) return -1;
      return a.targetDate < b.targetDate ? -1 : 1;
    });
}

export function daysUntil(date: ISODate, today: ISODate): number {
  return diffDays(today, date);
}

/** בכללית תמיד יש נשירה: מתכננים ל-85% הגעה בפועל. */
export const PLANNED_ATTENDANCE = 0.85;

export interface BudgetSummary {
  /** מספר מגיעים לתכנון (85% מהרשומים). */
  planned: number | null;
  perHead: number | null;
  total: number | null;
  orgPerHead: number | null;
  selfPerHead: number | null;
}

export function plannedAttendance(expected: number | null): number | null {
  if (expected === null || expected <= 0) return null;
  return Math.max(1, Math.round(expected * PLANNED_ATTENDANCE));
}

/** תחשיב לפי שלושת מודלי התקציב. ערך null = חסר נתון לחישוב. */
export function budgetSummary(event: Pick<OrgEvent, 'budget' | 'expectedAttendees'>): BudgetSummary {
  const planned = plannedAttendance(event.expectedAttendees);
  const b = event.budget;
  const empty: BudgetSummary = { planned, perHead: null, total: null, orgPerHead: null, selfPerHead: null };

  switch (b.model) {
    case 'none':
      return empty;
    case 'perHead':
      return { ...empty, perHead: b.perHead, total: b.perHead !== null && planned !== null ? b.perHead * planned : null };
    case 'lumpSum':
      return { ...empty, total: b.total, perHead: b.total !== null && planned !== null ? Math.round(b.total / planned) : null };
    case 'combined': {
      const perHead = b.orgShare !== null || b.selfShare !== null ? (b.orgShare ?? 0) + (b.selfShare ?? 0) : null;
      return {
        planned,
        orgPerHead: b.orgShare,
        selfPerHead: b.selfShare,
        perHead,
        total: perHead !== null && planned !== null ? perHead * planned : null,
      };
    }
  }
}

export function formatShekels(n: number): string {
  return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`;
}
