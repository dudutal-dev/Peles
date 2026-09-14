import { describe, expect, it } from 'vitest';
import { isAllowedPushHost, isValidDeviceId, normalizeSchedule, parseBearer, validateSubscription } from '../src/validation';
import { RFC8291 } from './helpers';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const keys = { p256dh: RFC8291.uaPublic, auth: RFC8291.authSecret };

describe('device id and bearer', () => {
  it('validates device ids', () => {
    expect(isValidDeviceId('abcdefghijklmnop')).toBe(true);
    expect(isValidDeviceId('A_b-9'.repeat(12) + 'abcd')).toBe(true); // 64
    expect(isValidDeviceId('short')).toBe(false);
    expect(isValidDeviceId('a'.repeat(65))).toBe(false);
    expect(isValidDeviceId('abcdefghijklmno!')).toBe(false);
  });

  it('parses bearer secrets within 32–128 chars', () => {
    expect(parseBearer(`Bearer ${'s'.repeat(32)}`)).toBe('s'.repeat(32));
    expect(parseBearer(`bearer ${'s'.repeat(128)}`)).toBe('s'.repeat(128));
    expect(parseBearer(`Bearer ${'s'.repeat(31)}`)).toBeNull();
    expect(parseBearer(`Bearer ${'s'.repeat(129)}`)).toBeNull();
    expect(parseBearer(`Basic ${'s'.repeat(40)}`)).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});

describe('validateSubscription', () => {
  it('accepts allowlisted push services', () => {
    for (const host of ['web.push.apple.com', 'api.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'wns2-by3p.notify.windows.com']) {
      expect(isAllowedPushHost(host)).toBe(true);
      const result = validateSubscription({ endpoint: `https://${host}/abc`, keys, expirationTime: null });
      expect(result).toEqual({ ok: true, value: { endpoint: `https://${host}/abc`, keys } });
    }
  });

  it('rejects other hosts, non-https and look-alikes', () => {
    for (const endpoint of [
      'http://web.push.apple.com/abc',
      'https://evil.example.com/abc',
      'https://web.push.apple.com.evil.com/abc',
      'https://evilpush.apple.com/abc',
      'https://notify.windows.com/abc',
      'https://web.push.apple.com:8443/abc',
      'https://user:pw@web.push.apple.com/abc',
      'not a url',
    ]) {
      expect(validateSubscription({ endpoint, keys }).ok, endpoint).toBe(false);
    }
  });

  it('checks key lengths', () => {
    const endpoint = 'https://web.push.apple.com/abc';
    expect(validateSubscription({ endpoint }).ok).toBe(false);
    expect(validateSubscription({ endpoint, keys: { ...keys, auth: 'AAAA' } }).ok).toBe(false);
    expect(validateSubscription({ endpoint, keys: { ...keys, p256dh: RFC8291.authSecret } }).ok).toBe(false);
    const compressed = 'A' + RFC8291.uaPublic.slice(1); // first byte 0x00 instead of 0x04
    expect(validateSubscription({ endpoint, keys: { ...keys, p256dh: compressed } }).ok).toBe(false);
    expect(validateSubscription({ endpoint, keys: { ...keys, auth: '***' } }).ok).toBe(false);
    expect(validateSubscription(null).ok).toBe(false);
  });
});

describe('normalizeSchedule', () => {
  it('drops out-of-window entries, dedupes by at (last wins) and sorts', () => {
    const result = normalizeSchedule(
      [
        { at: NOW + 2 * DAY, kind: 'evening' },
        { at: NOW - 6 * MIN, kind: 'morning' }, // too old
        { at: NOW - 4 * MIN, kind: 'morning' },
        { at: NOW + 61 * DAY, kind: 'morning' }, // too far
        { at: NOW + 60 * DAY, kind: 'morning' },
        { at: NOW + 2 * DAY, kind: 'morning' }, // duplicate
      ],
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: [
        { at: NOW - 4 * MIN, kind: 'morning' },
        { at: NOW + 2 * DAY, kind: 'morning' },
        { at: NOW + 60 * DAY, kind: 'morning' },
      ],
    });
  });

  it('allows 120 entries and rejects 121', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ at: NOW + i * MIN, kind: 'morning' }));
    expect(normalizeSchedule(make(120), NOW)).toMatchObject({ ok: true });
    expect(normalizeSchedule(make(121), NOW)).toMatchObject({ ok: false });
  });

  it('rejects malformed entries', () => {
    expect(normalizeSchedule('nope', NOW).ok).toBe(false);
    expect(normalizeSchedule([{ at: NOW, kind: 'noon' }], NOW).ok).toBe(false);
    expect(normalizeSchedule([{ at: '1', kind: 'morning' }], NOW).ok).toBe(false);
    expect(normalizeSchedule([{ at: NOW + 0.5, kind: 'morning' }], NOW).ok).toBe(false);
    expect(normalizeSchedule([null], NOW).ok).toBe(false);
    expect(normalizeSchedule([], NOW)).toEqual({ ok: true, value: [] });
  });
});
