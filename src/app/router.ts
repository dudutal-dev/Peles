import { useEffect, useState } from 'react';

export type Screen = 'morning' | 'waiting' | 'tasks' | 'more';
export type TasksTab = 'today' | 'overdue' | 'context' | 'all';

export interface Route {
  screen: Screen;
  tab: TasksTab;
  params: URLSearchParams;
}

const SCREENS: readonly Screen[] = ['morning', 'waiting', 'tasks', 'more'];
const TABS: readonly TasksTab[] = ['today', 'overdue', 'context', 'all'];

/** ניתוב לפי hash: ‎#/tasks/overdue?x=1 — עובד גם בלי שרת ובכל כתובת אחסון. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const [first, second] = path.split('/');
  const screen = SCREENS.find((s) => s === first) ?? 'morning';
  const tab = TABS.find((t) => t === second) ?? 'today';
  return { screen, tab, params: new URLSearchParams(query) };
}

export function href(screen: Screen, tab?: TasksTab, params?: Record<string, string>): string {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${screen}${tab ? `/${tab}` : ''}${q}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** מחליף את הכתובת בלי להוסיף רשומה להיסטוריה (למשל שינוי מסנן). */
export function replaceHash(next: string): void {
  const url = `${window.location.pathname}${window.location.search}${next}`;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
