import { createContext, useContext } from 'react';
import type { ISODate, Task } from '../domain/types';

export interface AppContextValue {
  today: ISODate;
  tasks: Task[];
  openTask: (id: string) => void;
  openCapture: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
