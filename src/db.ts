import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';

export type { DB as Database };

export interface AsinRow {
  asin: string;
  name: string;
  threshold_cents: number;
}

interface HistoryRow {
  price_amazon: number | null;
  price_new: number | null;
  price_used: number | null;
}

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS asins (
      asin TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      threshold_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL REFERENCES asins(asin),
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      price_amazon INTEGER,
      price_new INTEGER,
      price_used INTEGER
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL REFERENCES asins(asin),
      alerted_at TEXT NOT NULL DEFAULT (datetime('now')),
      price_cents INTEGER NOT NULL
    );
  `);
  return db;
}

export function upsertAsin(db: DB, asin: string, name: string, thresholdCents: number): void {
  db.prepare(
    `INSERT INTO asins (asin, name, threshold_cents) VALUES (?, ?, ?)
     ON CONFLICT(asin) DO UPDATE SET name = excluded.name, threshold_cents = excluded.threshold_cents`,
  ).run(asin, name, thresholdCents);
}

export function listAsins(db: DB): AsinRow[] {
  return db.prepare('SELECT asin, name, threshold_cents FROM asins').all() as AsinRow[];
}

export function insertPricePoint(
  db: DB,
  asin: string,
  priceAmazon: number | null,
  priceNew: number | null,
  priceUsed: number | null,
): void {
  db.prepare(
    `INSERT INTO price_history (asin, price_amazon, price_new, price_used) VALUES (?, ?, ?, ?)`,
  ).run(asin, priceAmazon, priceNew, priceUsed);
}

// Returns the mean of best available prices across price_history rows in the last 7 days.
// Returns null when there is no price data in that window.
export function get7dAvgCents(db: DB, asin: string): number | null {
  const rows = db.prepare(
    `SELECT price_amazon, price_new, price_used FROM price_history
     WHERE asin = ? AND recorded_at >= datetime('now', '-7 days')`,
  ).all(asin) as HistoryRow[];

  const prices = rows
    .map(r => r.price_amazon ?? r.price_new ?? r.price_used)
    .filter((p): p is number => p !== null && p > 0);

  if (prices.length === 0) return null;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

// Returns true when an alert for this ASIN was recorded within the last 24 hours.
export function wasAlertedRecently(db: DB, asin: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM alerts WHERE asin = ? AND alerted_at >= datetime('now', '-24 hours') LIMIT 1`,
  ).get(asin);
  return row !== undefined;
}

export function recordAlert(db: DB, asin: string, priceCents: number): void {
  db.prepare(`INSERT INTO alerts (asin, price_cents) VALUES (?, ?)`).run(asin, priceCents);
}
