import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * שדה טקסט עם שמירה אוטומטית: הערך המקומי מתעדכן מיד, השמירה למסד 400ms אחרי
 * שמפסיקים להקליד, וגם ביציאה מהשדה או מהמסך. כך עדכונים מהמסד לא מקפיצים את הסמן.
 */
export function useDraft(initial: string, save: (value: string) => unknown, delayMs = 400) {
  const [value, setValue] = useState(initial);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      const v = pending.current;
      pending.current = null;
      void saveRef.current(v);
    }
  }, []);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      pending.current = next;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return { value, setValue, onChange, flush };
}
