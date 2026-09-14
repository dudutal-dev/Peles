import { describe, expect, it } from 'vitest';
import { parseCapture } from '../src/domain/capture';
import { TODAY } from './helpers';

describe('parseCapture', () => {
  it('handles the meeting scenario from the spec in one line', () => {
    const r = parseCapture('אישור בטיחות אש מהקבלן עד יום חמישי #בטיחות @כהן', TODAY);
    expect(r.title).toBe('אישור בטיחות אש מהקבלן');
    expect(r.dueDate).toBe('2026-09-17');
    expect(r.tags).toEqual(['בטיחות']);
    expect(r.ownerName).toBe('כהן');
    expect(r.detected.map((d) => d.kind).sort()).toEqual(['due', 'owner', 'tag']);
  });

  it('leaves plain text untouched', () => {
    const r = parseCapture('להתקשר למחוז דרום לגבי הקבלן', TODAY);
    expect(r).toMatchObject({ title: 'להתקשר למחוז דרום לגבי הקבלן', dueDate: null, tags: [], ownerName: null });
  });

  it.each([
    ['להזמין אולם מחר', 'להזמין אולם', '2026-09-15'],
    ['לסגור הצעה מחרתיים', 'לסגור הצעה', '2026-09-16'],
    ['לשלוח סיכום עד היום', 'לשלוח סיכום', TODAY],
    ['עד סוף השבוע לסגור הצעת מחיר', 'לסגור הצעת מחיר', '2026-09-17'],
    ['לקבוע סיור בשבוע הבא', 'לקבוע סיור', '2026-09-20'],
    ['ישיבת תקציב ביום ה׳', 'ישיבת תקציב', '2026-09-17'],
    ["ישיבת תקציב ביום ה'", 'ישיבת תקציב', '2026-09-17'],
    ['תכניות עד חמישי', 'תכניות', '2026-09-17'],
    ['לבדוק שוב ביום שני', 'לבדוק שוב', '2026-09-21'],
    ['לשלוח סיכום עד 20.9', 'לשלוח סיכום', '2026-09-20'],
    ['לשלוח סיכום עד ה-3.10', 'לשלוח סיכום', '2026-10-03'],
    ['חוזה חתום 17/9', 'חוזה חתום', '2026-09-17'],
    ['חוזה חתום ב-5.1.27', 'חוזה חתום', '2027-01-05'],
    ['תשלום לספק עד 1.1', 'תשלום לספק', '2027-01-01'],
  ])('reads the due date in "%s"', (input, title, due) => {
    const r = parseCapture(input, TODAY);
    expect(r.title).toBe(title);
    expect(r.dueDate).toBe(due);
  });

  it.each([
    ['שני דברים לבדוק מול הקבלן'],
    ['הצעה עד 2.5 מיליון'],
    ['שטח של ב-3.5 מ"ר'],
    ['לעדכן מחרוזת תפילה'],
    ['לעבוד מהיום והלאה'],
    ['הזמנה ל-31.2'],
  ])('does not invent a date in "%s"', (input) => {
    const r = parseCapture(input, TODAY);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe(input);
  });

  it('turns underscores into spaces for tags and owners', () => {
    const r = parseCapture('לבדוק חשבון #מחוז_דן @יוסי_כהן', TODAY);
    expect(r.tags).toEqual(['מחוז דן']);
    expect(r.ownerName).toBe('יוסי כהן');
    expect(r.title).toBe('לבדוק חשבון');
  });

  it('keeps a token in the title when its detection was cancelled', () => {
    const r = parseCapture('להתקשר מחר לקבלן', TODAY, ['מחר']);
    expect(r.dueDate).toBeNull();
    expect(r.title).toBe('להתקשר מחר לקבלן');

    const t = parseCapture('לסגור #דחוף', TODAY, ['#דחוף']);
    expect(t.tags).toEqual([]);
    expect(t.title).toBe('לסגור #דחוף');
  });

  it('uses only the first date it finds', () => {
    const r = parseCapture('מחר להזכיר על הישיבה של יום חמישי', TODAY);
    expect(r.dueDate).toBe('2026-09-15');
    expect(r.title).toBe('להזכיר על הישיבה של יום חמישי');
  });
});
