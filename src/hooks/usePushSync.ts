import { useEffect } from 'react';
import type { Meeting, Task } from '../domain/types';
import { syncPushSchedule } from '../pwa/push';

/** אחרי כל שינוי במשימות או בישיבות (וכשהרשת חוזרת) — מעדכנים את לוח ההתראות בשרת. */
export function usePushSync(tasks: readonly Task[] | undefined, meetings: readonly Meeting[] | undefined): void {
  useEffect(() => {
    if (!tasks || !meetings) return;
    const run = () => void syncPushSchedule(tasks, meetings).catch(() => undefined);
    const timer = window.setTimeout(run, 4000);
    window.addEventListener('online', run);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', run);
    };
  }, [tasks, meetings]);
}
