import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

export type Db = Database.Database;

const MIGRATION_PATH = join(__dirname, '..', 'db', 'migrations', '001_init.sql');

export function openDb(filePath: string): Db {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  db.exec(sql);
  return db;
}

export interface PriceHistoryRow {
  id: number;
  asin: string;
  timestamp: number;
  price: number;
  currency: string;
}

export interface AlertConfigRow {
  asin: string;
  threshold: number;
  enabled: number;
}

export interface AlertLogRow {
  id: number;
  asin: string;
  alert_ts: number;
  price_at_alert: number;
}

export function insertPriceHistory(
  db: Db,
  asin: string,
  timestamp: number,
  price: number,
  currency = 'USD',
): void {
  db.prepare(
    'INSERT INTO price_history (asin, timestamp, price, currency) VALUES (?, ?, ?, ?)',
  ).run(asin, timestamp, price, currency);
}

export function upsertAlertConfig(
  db: Db,
  asin: string,
  threshold: number,
  enabled = true,
): void {
  db.prepare(
    `INSERT INTO alert_config (asin, threshold, enabled) VALUES (?, ?, ?)
     ON CONFLICT(asin) DO UPDATE SET threshold = excluded.threshold, enabled = excluded.enabled`,
  ).run(asin, threshold, enabled ? 1 : 0);
}

export function insertAlertLog(
  db: Db,
  asin: string,
  alertTs: number,
  priceAtAlert: number,
): void {
  db.prepare(
    'INSERT INTO alert_log (asin, alert_ts, price_at_alert) VALUES (?, ?, ?)',
  ).run(asin, alertTs, priceAtAlert);
}

export function getAlertConfig(db: Db, asin: string): AlertConfigRow | undefined {
  return db
    .prepare('SELECT * FROM alert_config WHERE asin = ?')
    .get(asin) as AlertConfigRow | undefined;
}

export function getPriceHistory(db: Db, asin: string): PriceHistoryRow[] {
  return db
    .prepare('SELECT * FROM price_history WHERE asin = ? ORDER BY timestamp ASC')
    .all(asin) as PriceHistoryRow[];
}
