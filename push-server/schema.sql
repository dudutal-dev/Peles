-- palas-push D1 schema. Stores only push subscriptions and wake-up times — never task content.

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,      -- SHA-256 hex of the device secret
  subscription TEXT NOT NULL,     -- JSON: { endpoint, keys: { p256dh, auth } }
  created_at INTEGER NOT NULL,    -- epoch ms
  updated_at INTEGER NOT NULL     -- epoch ms
);

CREATE TABLE IF NOT EXISTS schedule (
  device_id TEXT NOT NULL,
  at INTEGER NOT NULL,            -- epoch ms
  kind TEXT NOT NULL,             -- 'morning' | 'evening'
  PRIMARY KEY (device_id, at)
);

CREATE INDEX IF NOT EXISTS schedule_at ON schedule (at);
