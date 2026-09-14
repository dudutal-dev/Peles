import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleRequest, runScheduled, type AppEnv, type Deps } from '../src/app';
import { b64uDecode } from '../src/webpush';
import { decryptPayload, importEcdhPair, MemoryStore, RFC8291 } from './helpers';

const NOW = 1_800_000_000_000;
const HOUR = 3600_000;
const ORIGIN = 'https://dudutal-dev.github.io';
const DEVICE = 'device_0123456789abcdef';
const SECRET = 'x'.repeat(40);
const subscription = {
  endpoint: 'https://web.push.apple.com/QGuQyavXutnMH8Ch8B4Qvh2d',
  keys: { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret },
};

let env: AppEnv;
let store: MemoryStore;
let pushed: { url: string; payload: string }[];
let pushStatus: number;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  env = {
    ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:4188`,
    VAPID_SUBJECT: 'https://dudutal-dev.github.io/peles/',
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    MAX_DEVICES: '2',
  };
});

beforeEach(() => {
  store = new MemoryStore();
  pushed = [];
  pushStatus = 201;
});

function deps(now = NOW): Deps {
  const ua = importEcdhPair(RFC8291.uaPublic, RFC8291.uaPrivate);
  return {
    store,
    env,
    now,
    fetcher: async (input) => {
      const req = input as Request;
      const body = new Uint8Array(await req.arrayBuffer());
      pushed.push({ url: req.url, payload: await decryptPayload(body, await ua, b64uDecode(RFC8291.authSecret)) });
      return new Response('', { status: pushStatus });
    },
  };
}

function call(method: string, path: string, init: { body?: unknown; secret?: string; origin?: string } = {}) {
  const headers = new Headers({ Origin: init.origin ?? ORIGIN });
  if (init.secret) headers.set('Authorization', `Bearer ${init.secret}`);
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return handleRequest(new Request(`https://palas-push.example.workers.dev${path}`, { method, headers, body }), deps());
}

const put = (schedule: unknown[], secret = SECRET, id = DEVICE) =>
  call('PUT', `/devices/${id}`, { secret, body: { subscription, schedule } });

describe('HTTP API', () => {
  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await call('OPTIONS', `/devices/${DEVICE}`);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(ok.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(ok.headers.get('Access-Control-Allow-Methods')).toBe('GET, PUT, DELETE, POST, OPTIONS');

    const denied = await call('OPTIONS', `/devices/${DEVICE}`, { origin: 'https://evil.example' });
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /vapid-public-key returns the 65-byte public key', async () => {
    const res = await call('GET', '/vapid-public-key');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const { publicKey } = (await res.json()) as { publicKey: string };
    expect(b64uDecode(publicKey)).toHaveLength(65);
  });

  it('PUT creates a device, stores only the secret hash and the filtered schedule', async () => {
    const res = await put([
      { at: NOW + HOUR, kind: 'morning' },
      { at: NOW + HOUR, kind: 'evening' },
      { at: NOW - HOUR, kind: 'morning' },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, scheduled: 1 });
    const device = store.devices.get(DEVICE);
    expect(device?.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(device)).not.toContain(SECRET);
    expect(store.schedule.get(DEVICE)).toEqual([{ at: NOW + HOUR, kind: 'evening' }]);

    // Later PUT with the same secret replaces the schedule.
    const again = await put([]);
    expect(await again.json()).toEqual({ ok: true, scheduled: 0 });
    expect(store.schedule.get(DEVICE)).toEqual([]);
  });

  it('rejects a wrong secret with 403 and a missing one with 401', async () => {
    await put([]);
    expect((await put([], 'y'.repeat(40))).status).toBe(403);
    expect((await call('DELETE', `/devices/${DEVICE}`, { secret: 'y'.repeat(40) })).status).toBe(403);
    expect((await call('DELETE', `/devices/${DEVICE}`)).status).toBe(401);
    expect(store.devices.has(DEVICE)).toBe(true);
  });

  it('validates input with 400 and JSON errors', async () => {
    const badId = await put([], SECRET, 'short');
    expect(badId.status).toBe(400);
    expect(await badId.json()).toEqual({ error: 'invalid device id' });

    const badSub = await call('PUT', `/devices/${DEVICE}`, {
      secret: SECRET,
      body: { subscription: { ...subscription, endpoint: 'https://evil.example/x' }, schedule: [] },
    });
    expect(badSub.status).toBe(400);

    const tooMany = await put(Array.from({ length: 121 }, (_, i) => ({ at: NOW + i, kind: 'morning' })));
    expect(tooMany.status).toBe(400);
    expect(store.devices.size).toBe(0);
  });

  it('limits the number of devices with 429', async () => {
    expect((await put([], SECRET, 'aaaaaaaaaaaaaaaa')).status).toBe(200);
    expect((await put([], SECRET, 'bbbbbbbbbbbbbbbb')).status).toBe(200);
    const res = await put([], SECRET, 'cccccccccccccccc');
    expect(res.status).toBe(429);
    // Existing devices can still update.
    expect((await put([], SECRET, 'aaaaaaaaaaaaaaaa')).status).toBe(200);
  });

  it('DELETE removes the device and its schedule', async () => {
    await put([{ at: NOW + HOUR, kind: 'morning' }]);
    const res = await call('DELETE', `/devices/${DEVICE}`, { secret: SECRET });
    expect(await res.json()).toEqual({ ok: true });
    expect(store.devices.size).toBe(0);
    expect(store.schedule.size).toBe(0);
    expect((await call('DELETE', `/devices/${DEVICE}`, { secret: SECRET })).status).toBe(404);
  });

  it('POST /test sends an encrypted test push', async () => {
    await put([]);
    const res = await call('POST', `/devices/${DEVICE}/test`, { secret: SECRET });
    expect(await res.json()).toEqual({ ok: true, status: 201 });
    expect(pushed).toEqual([{ url: subscription.endpoint, payload: JSON.stringify({ kind: 'test', at: NOW }) }]);
  });

  it('POST /test deletes the device when the push service answers 410', async () => {
    await put([{ at: NOW + HOUR, kind: 'morning' }]);
    pushStatus = 410;
    const res = await call('POST', `/devices/${DEVICE}/test`, { secret: SECRET });
    expect(await res.json()).toEqual({ ok: false, status: 410 });
    expect(store.devices.size).toBe(0);
    expect(store.schedule.size).toBe(0);
  });

  it('returns 404/405 for unknown routes and methods', async () => {
    expect((await call('GET', '/nope')).status).toBe(404);
    expect((await call('GET', `/devices/${DEVICE}`)).status).toBe(405);
    expect((await call('POST', '/vapid-public-key')).status).toBe(405);
  });
});

describe('scheduled handler', () => {
  it('sends one push for the latest due row, drops stale rows and keeps future ones', async () => {
    await put([
      { at: NOW + HOUR, kind: 'morning' },
      { at: NOW + 2 * HOUR, kind: 'evening' },
      { at: NOW + 30 * 60_000, kind: 'evening' },
    ]);
    await runScheduled(deps(NOW + 90 * 60_000)); // two rows are due
    expect(pushed).toEqual([{ url: subscription.endpoint, payload: JSON.stringify({ kind: 'morning', at: NOW + HOUR }) }]);
    expect(store.schedule.get(DEVICE)).toEqual([{ at: NOW + 2 * HOUR, kind: 'evening' }]);

    pushed = [];
    await runScheduled(deps(NOW + 9 * HOUR)); // remaining row is now stale
    expect(pushed).toEqual([]);
    expect(store.schedule.get(DEVICE)).toEqual([]);
  });

  it('deletes gone devices (404/410) and survives failures of other devices', async () => {
    await put([{ at: NOW + HOUR, kind: 'morning' }], SECRET, 'aaaaaaaaaaaaaaaa');
    await put([{ at: NOW + HOUR, kind: 'evening' }], SECRET, 'bbbbbbbbbbbbbbbb');
    let calls = 0;
    const d = deps(NOW + HOUR);
    d.fetcher = async () => (++calls === 1 ? new Response('', { status: 410 }) : Promise.reject(new Error('network down')));
    await runScheduled(d);
    expect(calls).toBe(2);
    expect(store.devices.size).toBe(1);
    const [remaining] = [...store.schedule.values()];
    expect(remaining).toEqual([]); // due rows consumed even though the push threw
  });
});
