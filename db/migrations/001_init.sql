-- 001_init.sql: price-pulse initial schema
-- Tables: price_history, alert_config, alert_log

CREATE TABLE IF NOT EXISTS price_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  asin      TEXT    NOT NULL,
  timestamp INTEGER NOT NULL, -- Unix epoch seconds (UTC)
  price     INTEGER NOT NULL, -- USD cents
  currency  TEXT    NOT NULL DEFAULT 'USD'
);

CREATE INDEX IF NOT EXISTS idx_price_history_asin_ts ON price_history (asin, timestamp);

CREATE TABLE IF NOT EXISTS alert_config (
  asin      TEXT    PRIMARY KEY,
  threshold INTEGER NOT NULL, -- USD cents
  enabled   INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS alert_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asin           TEXT    NOT NULL,
  alert_ts       INTEGER NOT NULL, -- Unix epoch seconds (UTC)
  price_at_alert INTEGER NOT NULL  -- USD cents
);

CREATE INDEX IF NOT EXISTS idx_alert_log_asin_ts ON alert_log (asin, alert_ts);
