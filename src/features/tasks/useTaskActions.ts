import { useCallback } from 'react';
import { db } from '../../data/db';
import { softDeleteTask, restoreTask, updateTask } from '../../data/taskRepo';
import type { Task } from '../../domain/types';
import { useToast } from '../../ui/Toast';

export function useTaskActions() {
  const toast = useToast();

  /** מסמן כהושלם, עם ביטול שמחזיר את המשימה בדיוק למצבה הקודם (כולל "ממתין מאז"). */
  const complete = useCallback(
    async (task: Task) => {
      const before = task;
      await updateTask(db, task.id, { status: 'done', inbox: false });
      toast({
        message: task.status === 'waiting' ? 'סומן שהתקבל' : 'המשימה הושלמה',
        actionLabel: 'ביטול',
        onAction: () => void db.tasks.put(before),
      });
    },
    [toast],
  );

  const reopen = useCallback(async (task: Task) => {
    await updateTask(db, task.id, { status: 'todo' });
  }, []);

  const remove = useCallback(
    async (task: Task) => {
      await softDeleteTask(db, task.id);
      toast({
        message: 'המשימה נמחקה',
        actionLabel: 'ביטול',
        onAction: () => void restoreTask(db, task.id),
      });
    },
    [toast],
  );

  return { complete, reopen, remove };
}
