// Web Push using only WebCrypto: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291 / RFC 8188).

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  privateKey: CryptoKey; // ECDSA P-256, usage "sign"
  publicKey: string; // base64url, 65-byte uncompressed point
}

const enc = new TextEncoder();

// ---------- base64url ----------

export function b64uEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes base64url (padding optional). Throws on invalid input. */
export function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]*$/.test(clean) || clean.length % 4 === 1) throw new Error('invalid base64url');
  const bin = atob(clean.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ---------- VAPID ----------

/** Imports the private JWK secret ({kty, crv, x, y, d}) and derives the base64url public key. */
export async function importVapidKeys(jwkJson: string): Promise<VapidKeys> {
  const jwk = JSON.parse(jwkJson) as Partial<Record<'kty' | 'crv' | 'x' | 'y' | 'd', unknown>>;
  const { kty, crv, x, y, d } = jwk;
  if (kty !== 'EC' || crv !== 'P-256' || typeof x !== 'string' || typeof y !== 'string' || typeof d !== 'string') {
    throw new Error('VAPID_PRIVATE_JWK must be a P-256 EC private JWK');
  }
  const xb = b64uDecode(x);
  const yb = b64uDecode(y);
  if (xb.length !== 32 || yb.length !== 32) throw new Error('VAPID_PRIVATE_JWK has invalid coordinates');
  // Import only the core members: exported JWKs may carry key_ops/ext that would conflict.
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty, crv, x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return { privateKey, publicKey: b64uEncode(concat(new Uint8Array([0x04]), xb, yb)) };
}

/** Builds the `Authorization: vapid t=<JWT>, k=<public key>` header value. */
export async function vapidAuthorization(
  endpoint: string,
  subject: string,
  keys: VapidKeys,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: subject })),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto ECDSA output is raw r||s (64 bytes) — exactly the JWS ES256 signature format.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    enc.encode(signingInput),
  );
  return `vapid t=${signingInput}.${b64uEncode(sig)}, k=${keys.publicKey}`;
}

// ---------- Payload encryption (aes128gcm) ----------

const RECORD_SIZE = 4096;

export interface EncryptOptions {
  salt?: Uint8Array; // 16 bytes; random by default
  serverKeys?: CryptoKeyPair; // ECDH P-256 (public key extractable); ephemeral by default
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Encrypts `plaintext` for one subscription. Returns the full request body (header + single record). */
export async function encryptPayload(
  plaintext: Uint8Array,
  subscription: PushSubscription,
  options: EncryptOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  // One record: plaintext + 0x02 delimiter + 16-byte tag must fit in RECORD_SIZE.
  if (plaintext.length > RECORD_SIZE - 17) throw new Error('payload too large');

  const uaPublic = b64uDecode(subscription.keys.p256dh);
  const authSecret = b64uDecode(subscription.keys.auth);
  const salt = concat(options.salt ?? crypto.getRandomValues(new Uint8Array(16)));
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');

  const serverKeys =
    options.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey) as ArrayBuffer);

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // workers-types spells the ECDH member `$public`, but the runtime (and the spec) reads `public`.
  const ecdhParams = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, serverKeys.privateKey, 256));

  // RFC 8291 §3.4: mix the auth secret and both public keys into the IKM.
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  // RFC 8188 §2.2: content encryption key and nonce.
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      aesKey,
      concat(plaintext, new Uint8Array([0x02])), // 0x02 = last-record delimiter, no padding
    ),
  );

  // Header: salt(16) || rs(4, big-endian) || idlen(1) || keyid (= server public key, 65)
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

// ---------- Sending ----------

export type Fetcher = (input: Request | string, init?: RequestInit) => Promise<Response>;

export interface VapidConfig {
  keys: VapidKeys;
  subject: string;
}

export async function buildPushRequest(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidConfig,
): Promise<Request> {
  const body = await encryptPayload(enc.encode(payload), subscription);
  return new Request(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '10800',
      Urgency: 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: await vapidAuthorization(subscription.endpoint, vapid.subject, vapid.keys),
    },
    body,
  });
}

export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidConfig,
  fetcher: Fetcher = (input, init) => fetch(input, init), // wrapped: a detached `fetch` can throw "Illegal invocation"
): Promise<Response> {
  return fetcher(await buildPushRequest(subscription, payload, vapid));
}
