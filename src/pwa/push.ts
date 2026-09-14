import { db } from '../data/db';
import { getMeta, setMeta } from '../data/meta';
import { DEFAULT_PUSH_SETTINGS, computePushSchedule, type PushSettings, type ScheduleEntry } from '../domain/notifications';
import type { Meeting, Task } from '../domain/types';
import { isIOS, isStandalone } from './pwa';

/**
 * לקוח שרת ההתראות (push-server/). השרת מקבל רק את המנוי של הדפדפן ולוח זמנים
 * של "מתי להעיר" — בלי כותרות משימות, שמות או תאריכי יעד.
 */
const PUSH_URL = (import.meta.env.VITE_PUSH_URL ?? '').replace(/\/+$/, '');

export type PushAvailability = 'unconfigured' | 'dev' | 'unsupported' | 'needs-install' | 'denied' | 'available';

export function pushAvailability(): PushAvailability {
  if (!PUSH_URL) return 'unconfigured';
  if (!import.meta.env.PROD) return 'dev';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'available';
}

interface PushState {
  deviceId: string;
  secret: string;
  vapidKey: string;
  enabled: boolean;
  lastSync: string;
}

async function loadState(): Promise<PushState | null> {
  const raw = await getMeta<string>(db, 'pushState');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushState;
  } catch {
    return null;
  }
}

async function saveState(state: PushState): Promise<void> {
  await setMeta(db, 'pushState', JSON.stringify(state));
}

export async function isPushEnabled(): Promise<boolean> {
  return (await loadState())?.enabled === true;
}

export async function loadPushSettings(): Promise<PushSettings> {
  const raw = await getMeta<string>(db, 'pushSettings');
  if (!raw) return DEFAULT_PUSH_SETTINGS;
  try {
    return { ...DEFAULT_PUSH_SETTINGS, ...(JSON.parse(raw) as Partial<PushSettings>) };
  } catch {
    return DEFAULT_PUSH_SETTINGS;
  }
}

export async function savePushSettings(settings: PushSettings): Promise<void> {
  await setMeta(db, 'pushSettings', JSON.stringify(settings));
}

function randomToken(bytes: number): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function api(path: string, init: RequestInit & { secret?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.secret) headers.set('Authorization', `Bearer ${init.secret}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return fetch(`${PUSH_URL}${path}`, { ...init, headers });
}

async function fetchVapidKey(): Promise<string> {
  const res = await api('/vapid-public-key');
  if (!res.ok) throw new Error(`vapid ${res.status}`);
  const body = (await res.json()) as { publicKey?: string };
  if (!body.publicKey) throw new Error('vapid key missing');
  return body.publicKey;
}

async function subscribe(vapidKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey) });
}

export type PushResult = { ok: true } | { ok: false; error: string };

/** חייב להיקרא ישירות מלחיצה: iOS מאשר בקשת הרשאה רק מתוך פעולה של המשתמשת. */
export async function enablePush(tasks: readonly Task[], meetings: readonly Meeting[]): Promise<PushResult> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'לא ניתנה הרשאה להתראות. אפשר לאשר בהגדרות המכשיר, תחת התראות.' };
  }
  try {
    const vapidKey = await fetchVapidKey();
    await subscribe(vapidKey);
    const previous = await loadState();
    const state: PushState = {
      deviceId: previous?.deviceId ?? randomToken(24),
      secret: previous?.secret ?? randomToken(48),
      vapidKey,
      enabled: true,
      lastSync: '',
    };
    await saveState(state);
    return await syncPushSchedule(tasks, meetings, { force: true });
  } catch {
    return { ok: false, error: 'לא הצלחנו להתחבר לשרת ההתראות. צריך חיבור לרשת; אפשר לנסות שוב.' };
  }
}

export async function disablePush(): Promise<void> {
  const state = await loadState();
  if (!state) return;
  await saveState({ ...state, enabled: false, lastSync: '' });
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* ממשיכים גם אם הדפדפן לא מאפשר */
  }
  try {
    await api(`/devices/${state.deviceId}`, { method: 'DELETE', secret: state.secret });
  } catch {
    /* בלי רשת: המנוי כבר בוטל בדפדפן, והשרת ינקה כשיקבל 410 */
  }
}

/** מעלה לשרת את לוח הזמנים העדכני, רק אם השתנה (או force). */
export async function syncPushSchedule(
  tasks: readonly Task[],
  meetings: readonly Meeting[],
  options: { force?: boolean } = {},
): Promise<PushResult> {
  const state = await loadState();
  if (!state?.enabled || pushAvailability() !== 'available') return { ok: true };

  const settings = await loadPushSettings();
  const schedule: ScheduleEntry[] = computePushSchedule(tasks, meetings, settings, new Date());
  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();

  const fingerprint = JSON.stringify({ schedule, endpoint: subscription?.endpoint ?? '' });
  if (!options.force && subscription && fingerprint === state.lastSync) return { ok: true };

  try {
    // מפתח השרת הוחלף (למשל הוגדר מחדש) — מנוי ישן כבר לא יעבוד
    const vapidKey = await fetchVapidKey();
    if (!subscription || vapidKey !== state.vapidKey) {
      subscription = await subscribe(vapidKey);
      state.vapidKey = vapidKey;
    }
    const res = await api(`/devices/${state.deviceId}`, {
      method: 'PUT',
      secret: state.secret,
      body: JSON.stringify({ subscription: subscription.toJSON(), schedule }),
    });
    if (!res.ok) return { ok: false, error: `שרת ההתראות החזיר שגיאה (${res.status}).` };
    await saveState({ ...state, lastSync: JSON.stringify({ schedule, endpoint: subscription.endpoint }) });
    return { ok: true };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת ההתראות. הלוח יעודכן כשתחזור הרשת.' };
  }
}

export async function sendTestPush(): Promise<PushResult> {
  const state = await loadState();
  if (!state?.enabled) return { ok: false, error: 'ההתראות לא פעילות.' };
  try {
    const res = await api(`/devices/${state.deviceId}/test`, { method: 'POST', secret: state.secret });
    if (!res.ok) return { ok: false, error: `שליחת הבדיקה נכשלה (${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת ההתראות.' };
  }
}
