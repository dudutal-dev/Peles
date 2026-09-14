import { describe, expect, it } from 'vitest';
import { planDue, STALE_AFTER_MS } from '../src/schedule';

const NOW = 1_800_000_000_000;
const HOUR = 3600_000;

describe('planDue', () => {
  it('returns nothing when no rows are due', () => {
    expect(planDue([], NOW)).toEqual([]);
    expect(planDue([{ deviceId: 'a', at: NOW + 1, kind: 'morning' }], NOW)).toEqual([]);
  });

  it('sends one push per device for the latest due row and deletes all seen rows', () => {
    const plans = planDue(
      [
        { deviceId: 'a', at: NOW - 2 * HOUR, kind: 'evening' },
        { deviceId: 'a', at: NOW - HOUR, kind: 'morning' },
        { deviceId: 'b', at: NOW, kind: 'evening' },
      ],
      NOW,
    );
    expect(plans).toEqual([
      { deviceId: 'a', send: { kind: 'morning', at: NOW - HOUR }, deleteUpTo: NOW - HOUR },
      { deviceId: 'b', send: { kind: 'evening', at: NOW }, deleteUpTo: NOW },
    ]);
  });

  it('drops stale rows (older than 6 hours) without sending', () => {
    const stale = NOW - STALE_AFTER_MS - 1;
    expect(planDue([{ deviceId: 'a', at: stale, kind: 'morning' }], NOW)).toEqual([
      { deviceId: 'a', send: null, deleteUpTo: stale },
    ]);
    expect(
      planDue(
        [
          { deviceId: 'a', at: NOW - 6 * HOUR, kind: 'evening' }, // exactly 6h: still fresh
          { deviceId: 'a', at: stale, kind: 'morning' },
        ],
        NOW,
      ),
    ).toEqual([{ deviceId: 'a', send: { kind: 'evening', at: NOW - 6 * HOUR }, deleteUpTo: NOW - 6 * HOUR }]);
  });
});
