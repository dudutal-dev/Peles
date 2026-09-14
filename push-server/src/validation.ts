import { b64uDecode, type PushSubscription } from './webpush';

export type Kind = 'morning' | 'evening';
export interface ScheduleEntry {
  at: number; // epoch ms
  kind: Kind;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export const MAX_SCHEDULE_ENTRIES = 120;
const PAST_GRACE_MS = 5 * 60_000;
const MAX_AHEAD_MS = 60 * 24 * 3600_000;

const PUSH_HOSTS = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com'];

export function isValidDeviceId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

/** Extracts the device secret from `Authorization: Bearer <secret>`; null if missing or out of bounds. */
export function parseBearer(header: string | null): string | null {
  const match = /^Bearer (\S+)$/i.exec(header ?? '');
  const secret = match?.[1];
  return secret && secret.length >= 32 && secret.length <= 128 ? secret : null;
}

export function isAllowedPushHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function tryDecode(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null;
  try {
    return b64uDecode(value);
  } catch {
    return null;
  }
}

export function validateSubscription(input: unknown): Result<PushSubscription> {
  if (typeof input !== 'object' || input === null) return fail('subscription is required');
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

  if (typeof endpoint !== 'string' || endpoint.length > 2048) return fail('subscription.endpoint is invalid');
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return fail('subscription.endpoint is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !isAllowedPushHost(url.hostname)) {
    return fail('subscription.endpoint is not an allowed push service');
  }

  if (typeof keys !== 'object' || keys === null) return fail('subscription.keys is required');
  const p256dh = tryDecode(keys.p256dh);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 0x04) return fail('subscription.keys.p256dh is invalid');
  const auth = tryDecode(keys.auth);
  if (!auth || auth.length !== 16) return fail('subscription.keys.auth is invalid');

  // Store only what is needed to send (drops expirationTime and any extras).
  return ok({ endpoint, keys: { p256dh: keys.p256dh as string, auth: keys.auth as string } });
}

/** Validates the schedule, drops out-of-window entries, dedupes by `at` (last wins), sorts ascending. */
export function normalizeSchedule(input: unknown, now: number): Result<ScheduleEntry[]> {
  if (!Array.isArray(input)) return fail('schedule must be an array');
  if (input.length > MAX_SCHEDULE_ENTRIES) return fail(`schedule has more than ${MAX_SCHEDULE_ENTRIES} entries`);

  const byAt = new Map<number, Kind>();
  for (const entry of input as unknown[]) {
    const { at, kind } = (typeof entry === 'object' && entry !== null ? entry : {}) as { at?: unknown; kind?: unknown };
    if (typeof at !== 'number' || !Number.isSafeInteger(at)) return fail('schedule[].at must be an integer (epoch ms)');
    if (kind !== 'morning' && kind !== 'evening') return fail('schedule[].kind must be "morning" or "evening"');
    if (at < now - PAST_GRACE_MS || at > now + MAX_AHEAD_MS) continue;
    byAt.set(at, kind);
  }
  return ok([...byAt].map(([at, kind]) => ({ at, kind })).sort((a, b) => a.at - b.at));
}
