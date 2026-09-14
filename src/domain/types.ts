/** תאריך בלי שעה, בפורמט YYYY-MM-DD, לפי השעון המקומי. */
export type ISODate = string;
/** זמן במילישניות מאז epoch. */
export type Timestamp = number;

export type TaskStatus = 'todo' | 'waiting' | 'verify' | 'done';

export type OwnerKind = 'me' | 'director' | 'external';

export interface Owner {
  kind: OwnerKind;
  /** שם הגורם כשהאחריות אצל גורם חיצוני. ריק בשאר המקרים. */
  name: string;
}

export type ContextKind = 'project' | 'contact' | 'meeting' | 'event';

/**
 * ההקשר שהמשימה שייכת אליו. בשלב א' זה טקסט חופשי;
 * refId שמור לשלב ב', כשישיבות, אירועים וגורמים יהיו ישויות אמיתיות.
 */
export interface TaskContext {
  kind: ContextKind;
  label: string;
  refId: string | null;
}

export type SourceKind = 'direct' | 'self' | 'meeting';

export interface TaskSource {
  kind: SourceKind;
  /** שם הישיבה כשהמקור הוא ישיבה. */
  label: string;
  refId: string | null;
}

export interface ReminderRule {
  /** כמה ימים לפני תאריך היעד להתחיל להתריע על פריט שממתין לתגובה. */
  daysBefore: number;
  /** האם להמשיך להתריע כל יום אחרי שהמועד עבר. */
  repeatDailyWhenOverdue: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  owner: Owner;
  dueDate: ISODate | null;
  reminder: ReminderRule;
  /** דחוף לי. */
  urgent: boolean;
  /** ראש המינהל מחכה לזה. */
  directorAwaits: boolean;
  tags: string[];
  context: TaskContext | null;
  source: TaskSource;
  /** נוצרה בקליטה מהירה ועוד לא הושלמו פרטיה. */
  inbox: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** מתי הסטטוס השתנה לאחרונה. משמש למיון "כמה זמן זה תקוע". */
  statusChangedAt: Timestamp;
  completedAt: Timestamp | null;
  /** מחיקה רכה: מאפשרת ביטול, ובשלב ב' גם סנכרון מחיקות. */
  deletedAt: Timestamp | null;
}

/** ימים בשבוע: 0 = ראשון ... 6 = שבת. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Recurrence =
  | { kind: 'days'; days: Weekday[] }
  | { kind: 'weekly' };

export interface RoutineItem {
  id: string;
  title: string;
  recurrence: Recurrence;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

/** סימון ביצוע של פריט שגרה בתקופה מסוימת (יום, או שבוע לפריט שבועי). */
export interface RoutineCheck {
  /** `${periodKey}|${routineItemId}` */
  id: string;
  routineItemId: string;
  periodKey: string;
  done: boolean;
  updatedAt: Timestamp;
}

export interface Appointment {
  id: string;
  title: string;
  date: ISODate;
  /** HH:MM, או ריק לפגישה בלי שעה. */
  time: string;
  location: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

export interface MetaEntry {
  key: string;
  value: string | number | boolean | null;
}
