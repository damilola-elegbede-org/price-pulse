-- 001_init.sql: price-pulse initial schema
-- Tables: price_history, alert_config, alert_log

CREATE TABLE IF NOT EXISTS price_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  asin      TEXT    NOT NULL,
  timestamp INTEGER NOT NULL, -- Unix epoch seconds (UTC)
  price     INTEGER NOT NULL, -- USD cents
  currency  TEXT    NOT NULL DEFAULT 'USD',
  UNIQUE (asin, timestamp)
);

CREATE TABLE IF NOT EXISTS alert_config (
  asin      TEXT    PRIMARY KEY,
  threshold INTEGER NOT NULL, -- USD cents
  enabled   INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS alert_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asin           TEXT    NOT NULL,
  alert_ts       INTEGER NOT NULL, -- Unix epoch seconds (UTC)
  price_at_alert INTEGER NOT NULL, -- USD cents
  UNIQUE (asin, alert_ts),
  FOREIGN KEY (asin) REFERENCES alert_config(asin)
);
