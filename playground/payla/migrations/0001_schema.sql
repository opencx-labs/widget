-- Payla schema (Cloudflare D1 / SQLite).
-- Money is stored as integer minor units (cents). Timestamps are ISO-8601 TEXT.

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'en_US',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TEXT NOT NULL,
  settled_at    TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id                    TEXT PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'open',
  amount_cents          INTEGER NOT NULL,
  amount_refunded_cents INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'EUR',
  method                TEXT,
  description           TEXT NOT NULL DEFAULT '',
  customer_id           TEXT REFERENCES customers(id),
  settlement_id         TEXT REFERENCES settlements(id),
  created_at            TEXT NOT NULL,
  paid_at               TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id            TEXT PRIMARY KEY,
  payment_id    TEXT NOT NULL REFERENCES payments(id),
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  status        TEXT NOT NULL DEFAULT 'pending',
  reason        TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_links (
  id            TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  status        TEXT NOT NULL DEFAULT 'active',
  url           TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  paid_at       TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id            TEXT PRIMARY KEY,
  payment_id    TEXT NOT NULL REFERENCES payments(id),
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  reason        TEXT NOT NULL DEFAULT 'general',
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TEXT NOT NULL,
  due_at        TEXT
);

CREATE TABLE IF NOT EXISTS balance (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  available_cents   INTEGER NOT NULL DEFAULT 0,
  pending_cents     INTEGER NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'EUR'
);

CREATE TABLE IF NOT EXISTS settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  merchant_name        TEXT NOT NULL,
  merchant_id          TEXT NOT NULL,
  email                TEXT NOT NULL,
  country              TEXT NOT NULL DEFAULT 'NL',
  payout_schedule      TEXT NOT NULL DEFAULT 'daily',
  statement_descriptor TEXT NOT NULL DEFAULT 'PAYLA',
  test_mode            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created     ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_customer    ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_payment      ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_payment     ON disputes(payment_id);
