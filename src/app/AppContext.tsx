import { createContext, useContext } from 'react';
import type { EntityIndex } from '../domain/entities';
import type { Contact, ISODate, Meeting, OrgEvent, Task } from '../domain/types';

export interface AppContextValue {
  today: ISODate;
  tasks: Task[];
  meetings: Meeting[];
  contacts: Contact[];
  events: OrgEvent[];
  index: EntityIndex;
  openTask: (id: string) => void;
  /** @param initialText טקסט התחלתי, למשל "@שם_גורם " מתוך מסך גורם */
  openCapture: (initialText?: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
