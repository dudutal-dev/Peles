import type { DueRow } from './schedule';
import type { Kind, ScheduleEntry } from './validation';
import type { PushSubscription } from './webpush';

export interface Device {
  id: string;
  secretHash: string;
  subscription: PushSubscription;
}

/** Persistence boundary: the HTTP and cron logic only talk to this interface (tests use an in-memory fake). */
export interface Store {
  getDevice(id: string): Promise<Device | null>;
  countDevices(): Promise<number>;
  /** Upserts the device (never changes an existing secret hash) and atomically replaces its schedule. */
  saveDevice(device: Device, schedule: readonly ScheduleEntry[], now: number): Promise<void>;
  deleteDevice(id: string): Promise<void>;
  dueRows(now: number): Promise<DueRow[]>;
  deleteScheduleUpTo(deviceId: string, at: number): Promise<void>;
}

export function d1Store(db: D1Database): Store {
  return {
    async getDevice(id) {
      const row = await db
        .prepare('SELECT id, secret_hash, subscription FROM devices WHERE id = ?')
        .bind(id)
        .first<{ id: string; secret_hash: string; subscription: string }>();
      return row && { id: row.id, secretHash: row.secret_hash, subscription: JSON.parse(row.subscription) as PushSubscription };
    },

    async countDevices() {
      return (await db.prepare('SELECT COUNT(*) AS n FROM devices').first<number>('n')) ?? 0;
    },

    async saveDevice(device, schedule, now) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO devices (id, secret_hash, subscription, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(id) DO UPDATE SET subscription = excluded.subscription, updated_at = excluded.updated_at`,
          )
          .bind(device.id, device.secretHash, JSON.stringify(device.subscription), now),
        db.prepare('DELETE FROM schedule WHERE device_id = ?').bind(device.id),
        ...schedule.map((e) =>
          db.prepare('INSERT INTO schedule (device_id, at, kind) VALUES (?, ?, ?)').bind(device.id, e.at, e.kind),
        ),
      ]);
    },

    async deleteDevice(id) {
      await db.batch([
        db.prepare('DELETE FROM schedule WHERE device_id = ?').bind(id),
        db.prepare('DELETE FROM devices WHERE id = ?').bind(id),
      ]);
    },

    async dueRows(now) {
      const { results } = await db
        .prepare('SELECT device_id, at, kind FROM schedule WHERE at <= ? ORDER BY device_id, at')
        .bind(now)
        .all<{ device_id: string; at: number; kind: Kind }>();
      return results.map((r) => ({ deviceId: r.device_id, at: r.at, kind: r.kind }));
    },

    async deleteScheduleUpTo(deviceId, at) {
      await db.prepare('DELETE FROM schedule WHERE device_id = ? AND at <= ?').bind(deviceId, at).run();
    },
  };
}
