import type { DueRow } from '../src/schedule';
import type { Device, Store } from '../src/store';
import type { ScheduleEntry } from '../src/validation';
import { b64uDecode, b64uEncode } from '../src/webpush';

/** RFC 8291 Appendix A test vector (base64url values copied from the RFC). */
export const RFC8291 = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3j' +
    'l7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/** Imports an ECDH P-256 key pair from a raw uncompressed public key and a raw private scalar (base64url). */
export async function importEcdhPair(publicB64u: string, privateB64u: string): Promise<CryptoKeyPair> {
  const pub = b64uDecode(publicB64u);
  const x = b64uEncode(pub.slice(1, 33));
  const y = b64uEncode(pub.slice(33, 65));
  const alg = { name: 'ECDH', namedCurve: 'P-256' };
  const privateKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d: privateB64u }, alg, true, [
    'deriveBits',
  ]);
  const publicKey = await crypto.subtle.importKey('raw', pub, alg, true, []);
  return { privateKey, publicKey };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Receiver (user agent) side of RFC 8291, independent of the implementation under test. */
export async function decryptPayload(body: Uint8Array, ua: CryptoKeyPair, authSecret: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const salt = body.slice(0, 16);
  const idlen = body[20] ?? 0;
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const uaPublic = new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer);

  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const params = { name: 'ECDH', public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(params, ua.privateKey, 256));
  const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 0x02) throw new Error('missing last-record delimiter');
  return new TextDecoder().decode(padded.slice(0, end));
}

export class MemoryStore implements Store {
  devices = new Map<string, Device & { createdAt: number; updatedAt: number }>();
  schedule = new Map<string, ScheduleEntry[]>();

  async getDevice(id: string) {
    const d = this.devices.get(id);
    return d ? { id: d.id, secretHash: d.secretHash, subscription: d.subscription } : null;
  }
  async countDevices() {
    return this.devices.size;
  }
  async saveDevice(device: Device, schedule: readonly ScheduleEntry[], now: number) {
    const prev = this.devices.get(device.id);
    this.devices.set(device.id, {
      ...device,
      secretHash: prev?.secretHash ?? device.secretHash,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    });
    this.schedule.set(device.id, [...schedule]);
  }
  async deleteDevice(id: string) {
    this.devices.delete(id);
    this.schedule.delete(id);
  }
  async dueRows(now: number): Promise<DueRow[]> {
    return [...this.schedule].flatMap(([deviceId, rows]) =>
      rows.filter((r) => r.at <= now).map((r) => ({ deviceId, ...r })),
    );
  }
  async deleteScheduleUpTo(deviceId: string, at: number) {
    const rows = this.schedule.get(deviceId);
    if (rows) this.schedule.set(deviceId, rows.filter((r) => r.at > at));
  }
}
