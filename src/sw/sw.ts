/// <reference lib="webworker" />
/**
 * Service worker של פלס: עבודה בלי רשת (precache) והצגת התראות Push.
 * נבנה בנפרד בזמן build (build/serviceWorkerPlugin.ts) ומשתף לוגיקה עם האפליקציה.
 */
import { todayISO } from '../domain/dates';
import { composeNotification, type NotificationContent, type PushKind } from '../domain/notifications';
import type { Meeting, Task } from '../domain/types';

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __SW_VERSION__: string;

const CACHE = `lishka-${__SW_VERSION__}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(__PRECACHE__)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lishka-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

// ignoreVary: סקריפטי מודול נשלחים עם כותרת Origin, והעותקים השמורים נטענו בלעדיה;
// "Vary: Origin" היה גורם לפספוס במטמון בלי רשת.
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.match('index.html', MATCH).then((cached) => cached ?? fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, MATCH).then((cached) => cached ?? fetch(request)));
});

/* ——— התראות ——— */

self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

function readKind(event: PushEvent): PushKind {
  try {
    const data = event.data?.json() as { kind?: unknown } | undefined;
    if (data?.kind === 'evening' || data?.kind === 'test' || data?.kind === 'morning') return data.kind;
  } catch {
    /* גוף ריק או לא JSON */
  }
  return 'morning';
}

async function showPush(event: PushEvent): Promise<void> {
  const kind = readKind(event);
  let content: NotificationContent;
  try {
    const { tasks, meetings } = await readLocalData();
    content = composeNotification(kind, tasks, meetings, todayISO());
  } catch {
    // iOS מבטל מנוי אם Push לא מציג התראה — תמיד מציגים משהו
    content = { title: 'פלס', body: 'יש עדכון במשימות. אפשר לפתוח ולבדוק.', url: '#/morning' };
  }
  await self.registration.showNotification(content.title, {
    body: content.body,
    tag: `palas-${kind}`,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    lang: 'he',
    dir: 'rtl',
    data: { url: content.url },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data as { url?: string } | null)?.url ?? '#/morning';
  event.waitUntil(openApp(new URL(`./${hash}`, self.registration.scope).href));
});

async function openApp(target: string): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows[0];
  if (existing) {
    await existing.focus();
    try {
      await existing.navigate(target);
    } catch {
      /* חלון שלא בשליטת ה-worker — מספיק שהאפליקציה בפוקוס */
    }
    return;
  }
  await self.clients.openWindow(target);
}

/** קריאה ישירה מ-IndexedDB (בלי Dexie), רק מה שנדרש לטקסט ההתראה. */
function readLocalData(): Promise<{ tasks: Task[]; meetings: Meeting[] }> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lishka');
    req.onupgradeneeded = () => {
      // אין עדיין מסד (האפליקציה לא נפתחה) — לא יוצרים אחד מכאן
      req.transaction?.abort();
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => {
      const idb = req.result;
      const stores = ['tasks', 'meetings'].filter((s) => idb.objectStoreNames.contains(s));
      if (stores.length === 0) {
        idb.close();
        resolve({ tasks: [], meetings: [] });
        return;
      }
      const tx = idb.transaction(stores, 'readonly');
      const result: { tasks: Task[]; meetings: Meeting[] } = { tasks: [], meetings: [] };
      for (const store of stores) {
        const getAll = tx.objectStore(store).getAll();
        getAll.onsuccess = () => {
          if (store === 'tasks') result.tasks = getAll.result as Task[];
          else result.meetings = getAll.result as Meeting[];
        };
      }
      tx.oncomplete = () => {
        idb.close();
        resolve(result);
      };
      tx.onerror = () => {
        idb.close();
        reject(tx.error ?? new Error('IndexedDB read failed'));
      };
    };
  });
}
