import {
  addDays,
  endOfWorkWeek,
  nextWeekday,
  startOfNextWeek,
  toISODate,
  fromISODate,
  diffDays,
} from './dates';
import type { ISODate, Weekday } from './types';

/**
 * פענוח קליטה מהירה: שורת טקסט אחת שמתורגמת למשימה.
 * מזהה רק דפוסים חד-משמעיים, כדי שהכותרת לא תתקלקל:
 *   #תגית            → תגית
 *   @שם              → גורם אחראי (קו תחתון = רווח: @יוסי_כהן)
 *   היום / מחר / מחרתיים / עד סוף השבוע / בשבוע הבא
 *   עד יום חמישי / ביום ה׳ / עד חמישי
 *   עד 17.9 / ב-17.09.2026 / 17/9
 */

export type DetectedKind = 'due' | 'tag' | 'owner';

export interface Detected {
  kind: DetectedKind;
  /** הטקסט המקורי שזוהה, כדי שאפשר יהיה לבטל את הזיהוי. */
  token: string;
  value: string;
}

export interface ParsedCapture {
  title: string;
  dueDate: ISODate | null;
  tags: string[];
  ownerName: string | null;
  detected: Detected[];
}

const L = '\\p{L}\\p{N}';
const BEFORE = `(?<![${L}])`;
const AFTER = `(?![${L}])`;

const WEEKDAY_WORDS: Record<string, Weekday> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

const WEEKDAY_LETTER: Record<string, Weekday> = {
  א: 0,
  ב: 1,
  ג: 2,
  ד: 3,
  ה: 4,
  ו: 5,
};

interface DateRule {
  re: RegExp;
  resolve: (m: RegExpExecArray, today: ISODate) => ISODate | null;
}

/** מספר כמו "2.5 מיליון" או "3.5 מ״ר" אינו תאריך. */
const NOT_AMOUNT = `(?!\\s*(?:מיליון|מיליארד|אלף|אלפים|מלש["״]?ח|ש["״]ח|₪|%|מ["״]ר|מטר|קומות|ק["״]מ))`;

const DATE_RULES: DateRule[] = [
  {
    // עד 17.9 / ב-17.09 / עד ה-3.10.26 — עם נקודה חייבים מילת יחס, כדי לא לבלבל עם סכומים
    re: new RegExp(
      `${BEFORE}(?:עד\\s+(?:ה-?)?|ב-?|ל-?)(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2}|\\d{4}))?${AFTER}${NOT_AMOUNT}`,
      'u',
    ),
    resolve: (m, today) => resolveNumericDate(m[1], m[2], m[3], today),
  },
  {
    // 17/9 או 17/09/2026 — לוכסן מספיק לבד
    re: new RegExp(`${BEFORE}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${AFTER}${NOT_AMOUNT}`, 'u'),
    resolve: (m, today) => resolveNumericDate(m[1], m[2], m[3], today),
  },
  {
    re: new RegExp(`${BEFORE}(?:עד\\s+)?(?:ה)?מחרתיים${AFTER}`, 'u'),
    resolve: (_m, today) => addDays(today, 2),
  },
  {
    re: new RegExp(`${BEFORE}(?:עד\\s+)?(?:ה|ל)?מחר${AFTER}`, 'u'),
    resolve: (_m, today) => addDays(today, 1),
  },
  {
    re: new RegExp(`${BEFORE}(?:עד\\s+)?(?:ל|ב)?היום${AFTER}`, 'u'),
    resolve: (_m, today) => today,
  },
  {
    re: new RegExp(`${BEFORE}(?:עד\\s+|ב|ל)?סוף\\s+השבוע${AFTER}`, 'u'),
    resolve: (_m, today) => endOfWorkWeek(today),
  },
  {
    re: new RegExp(`${BEFORE}(?:עד\\s+|ב|ל)?שבוע\\s+הבא${AFTER}`, 'u'),
    resolve: (_m, today) => startOfNextWeek(today),
  },
  {
    // עד יום חמישי / ביום חמישי / עד חמישי / ליום חמישי
    re: new RegExp(
      `${BEFORE}(?:עד\\s+(?:יום\\s+)?|(?:ב|ל)?יום\\s+)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)${AFTER}`,
      'u',
    ),
    resolve: (m, today) => {
      const day = m[1] !== undefined ? WEEKDAY_WORDS[m[1]] : undefined;
      return day === undefined ? null : nextWeekday(today, day);
    },
  },
  {
    // ביום ה׳ / עד יום ה'
    re: new RegExp(`${BEFORE}(?:עד\\s+)?(?:ב|ל)?יום\\s+([א-ו])['׳]`, 'u'),
    resolve: (m, today) => {
      const day = m[1] !== undefined ? WEEKDAY_LETTER[m[1]] : undefined;
      return day === undefined ? null : nextWeekday(today, day);
    },
  },
];

function resolveNumericDate(
  dayStr: string | undefined,
  monthStr: string | undefined,
  yearStr: string | undefined,
  today: ISODate,
): ISODate | null {
  const day = Number(dayStr);
  const month = Number(monthStr);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const todayDate = fromISODate(today);
  let year: number;
  if (yearStr === undefined) {
    year = todayDate.getFullYear();
  } else {
    year = Number(yearStr);
    if (yearStr.length === 2) year += 2000;
  }

  const candidate = new Date(year, month - 1, day);
  // 31.2 וכדומה: Date "מגלגל" לחודש הבא — זה לא תאריך אמיתי.
  if (candidate.getMonth() !== month - 1) return null;

  let iso = toISODate(candidate);
  // תאריך בלי שנה שעבר מזמן מתייחס כנראה לשנה הבאה.
  if (yearStr === undefined && diffDays(iso, today) > 60) {
    const next = new Date(year + 1, month - 1, day);
    if (next.getMonth() !== month - 1) return null;
    iso = toISODate(next);
  }
  return iso;
}

const TAG_RE = new RegExp(`(^|\\s)#([${L}_-]+)`, 'gu');
const OWNER_RE = new RegExp(`(^|\\s)@([${L}_.-]+)`, 'u');

function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,.;:\-–—]+|[\s,;:\-–—]+$/g, '')
    .trim();
}

/**
 * @param ignoreTokens טקסטים שהמשתמשת ביטלה את זיהויים — יישארו בכותרת כמו שהם.
 */
export function parseCapture(
  input: string,
  today: ISODate,
  ignoreTokens: readonly string[] = [],
): ParsedCapture {
  let text = ` ${input} `;
  const detected: Detected[] = [];
  const ignored = new Set(ignoreTokens);

  // תגיות
  const tags: string[] = [];
  text = text.replace(TAG_RE, (full, lead: string, tag: string) => {
    const token = `#${tag}`;
    if (ignored.has(token)) return full;
    const value = tag.replace(/_/g, ' ');
    if (!tags.includes(value)) tags.push(value);
    detected.push({ kind: 'tag', token, value });
    return lead;
  });

  // גורם אחראי
  let ownerName: string | null = null;
  const ownerMatch = OWNER_RE.exec(text);
  if (ownerMatch && ownerMatch[2] !== undefined) {
    const token = `@${ownerMatch[2]}`;
    if (!ignored.has(token)) {
      ownerName = ownerMatch[2].replace(/_/g, ' ');
      detected.push({ kind: 'owner', token, value: ownerName });
      text = text.replace(ownerMatch[0], ownerMatch[1] ?? '');
    }
  }

  // תאריך יעד — הכלל הראשון שמתאים
  let dueDate: ISODate | null = null;
  for (const rule of DATE_RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const token = m[0].trim();
    if (ignored.has(token)) continue;
    const resolved = rule.resolve(m, today);
    if (resolved === null) continue;
    dueDate = resolved;
    detected.push({ kind: 'due', token, value: resolved });
    text = text.slice(0, m.index) + text.slice(m.index + m[0].length);
    break;
  }

  return { title: cleanTitle(text), dueDate, tags, ownerName, detected };
}
