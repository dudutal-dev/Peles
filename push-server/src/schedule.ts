import type { Kind } from './validation';

export interface DueRow {
  deviceId: string;
  at: number;
  kind: Kind;
}

export interface DevicePlan {
  deviceId: string;
  /** The single push to send, or null when every due row is stale. */
  send: { kind: Kind; at: number } | null;
  /** Delete this device's schedule rows with at <= deleteUpTo (all rows seen in this run). */
  deleteUpTo: number;
}

export const STALE_AFTER_MS = 6 * 3600_000;

/** Groups due rows (at <= now) per device and decides what to send: one push for the latest non-stale row. */
export function planDue(rows: readonly DueRow[], now: number): DevicePlan[] {
  const byDevice = new Map<string, DueRow[]>();
  for (const row of rows) {
    if (row.at > now) continue;
    const list = byDevice.get(row.deviceId) ?? [];
    list.push(row);
    byDevice.set(row.deviceId, list);
  }

  return [...byDevice].map(([deviceId, list]) => {
    const deleteUpTo = Math.max(...list.map((r) => r.at));
    const fresh = list.filter((r) => r.at >= now - STALE_AFTER_MS);
    const latest = fresh.reduce<DueRow | null>((best, r) => (best && best.at >= r.at ? best : r), null);
    return { deviceId, send: latest && { kind: latest.kind, at: latest.at }, deleteUpTo };
  });
}
