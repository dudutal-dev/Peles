import { describe, expect, it } from 'vitest';
import {
  b64uDecode,
  b64uEncode,
  buildPushRequest,
  encryptPayload,
  importVapidKeys,
  vapidAuthorization,
} from '../src/webpush';
import { decryptPayload, importEcdhPair, RFC8291 } from './helpers';

const dec = new TextDecoder();

async function newVapidJwk(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
}

describe('base64url', () => {
  it('round-trips arbitrary bytes of every length', () => {
    for (let len = 0; len < 70; len++) {
      const bytes = crypto.getRandomValues(new Uint8Array(len));
      const encoded = b64uEncode(bytes);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(b64uDecode(encoded)).toEqual(bytes);
    }
  });

  it('uses the URL-safe alphabet without padding, and accepts padded input', () => {
    expect(b64uEncode(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(b64uDecode('-_8=')).toEqual(new Uint8Array([0xfb, 0xff]));
  });

  it('rejects invalid input', () => {
    expect(() => b64uDecode('ab+c')).toThrow();
    expect(() => b64uDecode('abcde')).toThrow();
  });
});

describe('aes128gcm encryption (RFC 8291)', () => {
  it('matches the RFC 8291 Appendix A test vector byte-for-byte', async () => {
    const body = await encryptPayload(
      b64uDecode(RFC8291.plaintext),
      { endpoint: 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV', keys: { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret } },
      { salt: b64uDecode(RFC8291.salt), serverKeys: await importEcdhPair(RFC8291.asPublic, RFC8291.asPrivate) },
    );
    expect(b64uEncode(body)).toBe(RFC8291.body);
    expect(body).toEqual(b64uDecode(RFC8291.body));
  });

  it('the independent test decryptor reads the RFC vector', async () => {
    const ua = await importEcdhPair(RFC8291.uaPublic, RFC8291.uaPrivate);
    const text = await decryptPayload(b64uDecode(RFC8291.body), ua, b64uDecode(RFC8291.authSecret));
    expect(text).toBe('When I grow up, I want to be a watermelon');
  });

  it('with random salt and ephemeral keys, produces a decryptable single record', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = {
      endpoint: 'https://web.push.apple.com/abc',
      keys: { p256dh: b64uEncode((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer), auth: b64uEncode(auth) },
    };
    const payload = '{"kind":"morning","at":1700000000000}';
    const body = await encryptPayload(new TextEncoder().encode(payload), sub);

    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(0x04);
    expect(body.length).toBe(86 + payload.length + 1 + 16);
    expect(await decryptPayload(body, ua, auth)).toBe(payload);

    const again = await encryptPayload(new TextEncoder().encode(payload), sub);
    expect(b64uEncode(again.slice(0, 16))).not.toBe(b64uEncode(body.slice(0, 16)));
  });

  it('rejects payloads that do not fit one 4096-byte record', async () => {
    const sub = { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret } };
    await expect(encryptPayload(new Uint8Array(4080), sub)).rejects.toThrow('payload too large');
  });
});

describe('VAPID (RFC 8292)', () => {
  it('derives the public key from the private JWK', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
    const keys = await importVapidKeys(jwk);
    const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
    expect(keys.publicKey).toBe(b64uEncode(raw));
    expect(b64uDecode(keys.publicKey)).toHaveLength(65);
  });

  it('rejects a non P-256 or public-only JWK', async () => {
    await expect(importVapidKeys('{"kty":"EC","crv":"P-384","x":"a","y":"b","d":"c"}')).rejects.toThrow();
    const jwk = JSON.parse(await newVapidJwk()) as Record<string, unknown>;
    delete jwk.d;
    await expect(importVapidKeys(JSON.stringify(jwk))).rejects.toThrow();
  });

  it('signs a JWT that verifies with the public key, with aud = endpoint origin', async () => {
    const keys = await importVapidKeys(await newVapidJwk());
    const endpoint = 'https://web.push.apple.com/QGuQyavXutnMH8Ch8B4Qvh2d/some/path?x=1';
    const now = 1_700_000_000;
    const header = await vapidAuthorization(endpoint, 'https://dudutal-dev.github.io/peles/', keys, now);

    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h = '', c = '', s = '', k = ''] = match ?? [];
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(dec.decode(b64uDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(dec.decode(b64uDecode(c)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now + 12 * 3600,
      sub: 'https://dudutal-dev.github.io/peles/',
    });

    const sig = b64uDecode(s);
    expect(sig).toHaveLength(64);
    const publicKey = await crypto.subtle.importKey('raw', b64uDecode(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sig,
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(valid).toBe(true);
  });
});

describe('push request', () => {
  it('has the Web Push headers and an encrypted body', async () => {
    const keys = await importVapidKeys(await newVapidJwk());
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret } };
    const req = await buildPushRequest(sub, '{"kind":"test","at":1}', { keys, subject: 'https://example.com' });

    expect(req.method).toBe('POST');
    expect(req.url).toBe(sub.endpoint);
    expect(req.headers.get('TTL')).toBe('10800');
    expect(req.headers.get('Urgency')).toBe('normal');
    expect(req.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(req.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(req.headers.get('Authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);

    const ua = await importEcdhPair(RFC8291.uaPublic, RFC8291.uaPrivate);
    const body = new Uint8Array(await req.arrayBuffer());
    expect(await decryptPayload(body, ua, b64uDecode(RFC8291.authSecret))).toBe('{"kind":"test","at":1}');
  });
});
