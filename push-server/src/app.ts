import { planDue } from './schedule';
import type { Device, Store } from './store';
import { isValidDeviceId, normalizeSchedule, parseBearer, validateSubscription } from './validation';
import { importVapidKeys, sendPush, type Fetcher, type VapidConfig } from './webpush';

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  VAPID_SUBJECT?: string;
  VAPID_PRIVATE_JWK?: string; // secret
  MAX_DEVICES?: string;
}

export type AppEnv = Omit<Env, 'DB'>;

export interface Deps {
  store: Store;
  env: AppEnv;
  now?: number;
  fetcher?: Fetcher;
}

const MAX_BODY_CHARS = 32_000;

// ---------- helpers ----------

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const error = (status: number, message: string) => json(status, { error: message });

function withCors(response: Response, request: Request, env: AppEnv): Response {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const headers = new Headers(response.headers);
  headers.append('Vary', 'Origin');
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, DELETE, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(response.body, { status: response.status, headers });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let vapidCache: { jwk: string; keys: ReturnType<typeof importVapidKeys> } | undefined;

/** Returns VAPID config, or null if the secret/subject are not configured. Keys are cached per isolate. */
export async function loadVapid(env: AppEnv): Promise<VapidConfig | null> {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) return null;
  if (vapidCache?.jwk !== env.VAPID_PRIVATE_JWK) {
    vapidCache = { jwk: env.VAPID_PRIVATE_JWK, keys: importVapidKeys(env.VAPID_PRIVATE_JWK) };
  }
  return { keys: await vapidCache.keys, subject: env.VAPID_SUBJECT };
}

/** Sends one push; a 404/410 from the push service means the subscription is gone, so the device is deleted. */
async function pushToDevice(deps: Deps, vapid: VapidConfig, device: Device, payload: object): Promise<number> {
  const res = await sendPush(device.subscription, JSON.stringify(payload), vapid, deps.fetcher);
  if (res.status === 404 || res.status === 410) {
    await deps.store.deleteDevice(device.id);
  } else if (!res.ok) {
    console.error(`push to ${device.id} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.status;
}

// ---------- HTTP ----------

export async function handleRequest(request: Request, deps: Deps): Promise<Response> {
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), request, deps.env);
  let response: Response;
  try {
    response = await route(request, deps);
  } catch (err) {
    console.error('unhandled error', err);
    response = error(500, 'internal error');
  }
  return withCors(response, request, deps.env);
}

async function route(request: Request, deps: Deps): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/vapid-public-key') {
    if (method !== 'GET') return error(405, 'method not allowed');
    const vapid = await loadVapid(deps.env);
    return vapid ? json(200, { publicKey: vapid.keys.publicKey }) : error(500, 'server is not configured');
  }

  const match = /^\/devices\/([^/]+)(\/test)?$/.exec(pathname);
  if (!match) return error(404, 'not found');
  const deviceId = match[1] ?? '';
  const isTest = match[2] !== undefined;
  if (isTest ? method !== 'POST' : method !== 'PUT' && method !== 'DELETE') {
    return error(405, 'method not allowed');
  }
  if (!isValidDeviceId(deviceId)) return error(400, 'invalid device id');

  const secret = parseBearer(request.headers.get('Authorization'));
  if (!secret) return error(401, 'missing or invalid bearer token');
  const secretHash = await sha256Hex(secret);

  const existing = await deps.store.getDevice(deviceId);
  if (existing && !timingSafeEqual(existing.secretHash, secretHash)) return error(403, 'forbidden');

  const now = deps.now ?? Date.now();

  if (method === 'PUT') {
    if (!existing) {
      const max = Number.parseInt(deps.env.MAX_DEVICES ?? '', 10);
      if ((await deps.store.countDevices()) >= (Number.isFinite(max) && max > 0 ? max : 10)) {
        return error(429, 'device limit reached');
      }
    }
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return error(413, 'body too large');
    let body: { subscription?: unknown; schedule?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
      if (typeof body !== 'object' || body === null) throw new Error();
    } catch {
      return error(400, 'body must be a JSON object');
    }
    const subscription = validateSubscription(body.subscription);
    if (!subscription.ok) return error(400, subscription.error);
    const schedule = normalizeSchedule(body.schedule, now);
    if (!schedule.ok) return error(400, schedule.error);

    await deps.store.saveDevice({ id: deviceId, secretHash, subscription: subscription.value }, schedule.value, now);
    return json(200, { ok: true, scheduled: schedule.value.length });
  }

  if (!existing) return error(404, 'device not found');

  if (method === 'DELETE') {
    await deps.store.deleteDevice(deviceId);
    return json(200, { ok: true });
  }

  // POST /devices/:id/test
  const vapid = await loadVapid(deps.env);
  if (!vapid) return error(500, 'server is not configured');
  let status: number;
  try {
    status = await pushToDevice(deps, vapid, existing, { kind: 'test', at: now });
  } catch (err) {
    console.error(`test push to ${deviceId} failed`, err);
    return error(502, 'push service unreachable');
  }
  return json(200, { ok: status >= 200 && status < 300, status });
}

// ---------- Cron ----------

export async function runScheduled(deps: Deps): Promise<void> {
  const now = deps.now ?? Date.now();
  const plans = planDue(await deps.store.dueRows(now), now);
  if (plans.length === 0) return;
  const vapid = await loadVapid(deps.env);
  if (!vapid) {
    console.error('VAPID_PRIVATE_JWK / VAPID_SUBJECT not configured; skipping scheduled pushes');
    return;
  }

  // Devices are independent: one failure is logged and never blocks the others.
  await Promise.all(
    plans.map(async (plan) => {
      try {
        const device = plan.send && (await deps.store.getDevice(plan.deviceId));
        if (device && plan.send) {
          const status = await pushToDevice(deps, vapid, device, plan.send);
          if (status === 404 || status === 410) return; // device and its schedule are already deleted
        }
      } catch (err) {
        console.error(`scheduled push for ${plan.deviceId} failed`, err);
      }
      // Due rows are consumed whether or not the push succeeded (no retry loop).
      await deps.store
        .deleteScheduleUpTo(plan.deviceId, plan.deleteUpTo)
        .catch((err: unknown) => console.error(`cleanup for ${plan.deviceId} failed`, err));
    }),
  );
}
