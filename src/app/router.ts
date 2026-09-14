import { useEffect, useState } from 'react';

export type Screen =
  | 'morning'
  | 'waiting'
  | 'tasks'
  | 'more'
  | 'settings'
  | 'meetings'
  | 'meeting'
  | 'events'
  | 'event'
  | 'contacts'
  | 'contact'
  | 'guide';

export type TasksTab = 'today' | 'overdue' | 'context' | 'all';

export interface Route {
  screen: Screen;
  tab: TasksTab;
  /** מזהה ישות במסכי פרטים (#/meeting/<id>). */
  id: string | null;
  params: URLSearchParams;
}

const SCREENS: readonly Screen[] = [
  'morning',
  'waiting',
  'tasks',
  'more',
  'settings',
  'meetings',
  'meeting',
  'events',
  'event',
  'contacts',
  'contact',
  'guide',
];
const TABS: readonly TasksTab[] = ['today', 'overdue', 'context', 'all'];

const DETAIL_PARENT: Partial<Record<Screen, Screen>> = {
  meeting: 'meetings',
  event: 'events',
  contact: 'contacts',
};

/** המסך "העליון" שאליו שייך מסך פרטים; משמש לסימון בסרגל הניווט. */
export const HUB_SCREENS: readonly Screen[] = ['more', 'settings', 'meetings', 'meeting', 'events', 'event', 'contacts', 'contact', 'guide'];

/** ניתוב לפי hash: ‎#/tasks/overdue?x=1 או ‎#/meeting/<id> — עובד בלי שרת ובכל כתובת אחסון. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const [first, second] = path.split('/');
  let screen = SCREENS.find((s) => s === first) ?? 'morning';
  const tab = TABS.find((t) => t === second) ?? 'today';
  let id: string | null = null;

  const parent = DETAIL_PARENT[screen];
  if (parent) {
    id = second ? decodeURIComponent(second) : null;
    if (!id) screen = parent;
  }
  return { screen, tab, id, params: new URLSearchParams(query) };
}

/** @param sub לשונית (במשימות) או מזהה (במסכי פרטים) */
export function href(screen: Screen, sub?: string, params?: Record<string, string>): string {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${screen}${sub ? `/${encodeURIComponent(sub)}` : ''}${q}`;
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

export function navigate(next: string): void {
  if (window.location.hash !== next) window.location.hash = next;
}

/**
 * ניווט אחרי סגירת גיליון. סגירת גיליון מבצעת history.back() אסינכרוני;
 * ניווט מיידי היה נדרס על ידו וחוזר למסך הקודם.
 */
export function navigateAfterSheet(next: string): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', go);
    window.setTimeout(() => navigate(next), 0);
  };
  window.addEventListener('popstate', go);
  window.setTimeout(go, 400);
}
