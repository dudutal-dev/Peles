import { createTask, type NewTaskInput } from '../src/domain/task';
import { startOfDayTs } from '../src/domain/dates';
import type { ISODate, Task } from '../src/domain/types';

/** יום שני, 14 בספטמבר 2026. */
export const TODAY: ISODate = '2026-09-14';

export function makeTask(input: Partial<NewTaskInput> & Partial<Pick<Task, 'createdAt' | 'statusChangedAt' | 'completedAt' | 'deletedAt'>> = {}): Task {
  const { createdAt, statusChangedAt, completedAt, deletedAt, ...rest } = input;
  const base = createTask({ title: 'משימה', ...rest }, createdAt ?? startOfDayTs(TODAY));
  return {
    ...base,
    ...(statusChangedAt !== undefined ? { statusChangedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(deletedAt !== undefined ? { deletedAt } : {}),
  };
}
