import { useEffect, useState } from 'react';
import { todayISO } from '../domain/dates';
import type { ISODate } from '../domain/types';

/**
 * התאריך של היום, שמתעדכן גם כשהאפליקציה נשארה פתוחה בלילה
 * וחוזרים אליה בבוקר (חזרה לחלון, או בדיקה פעם בדקה).
 */
export function useToday(): ISODate {
  const [today, setToday] = useState<ISODate>(() => todayISO());

  useEffect(() => {
    const check = () => {
      const now = todayISO();
      setToday((prev) => (prev === now ? prev : now));
    };
    const interval = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  return today;
}
