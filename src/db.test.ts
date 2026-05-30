import Database from 'better-sqlite3';
import {
  openDb,
  upsertAsin,
  listAsins,
  insertPricePoint,
  get7dAvgCents,
  wasAlertedRecently,
  recordAlert,
} from './db';
import type { Database as DB } from 'better-sqlite3';

function memDb(): DB {
  return openDb(':memory:');
}

describe('db.openDb', () => {
  it('creates all three tables', () => {
    const db = memDb();
    const tables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).all() as { name: string }[]).map(r => r.name);
    expect(tables).toEqual(expect.arrayContaining(['alerts', 'asins', 'price_history']));
    db.close();
  });

  it('is idempotent — calling openDb twice does not throw', () => {
    const db = memDb();
    expect(() => openDb(':memory:')).not.toThrow();
    db.close();
  });
});

describe('db.upsertAsin / listAsins', () => {
  it('inserts a new ASIN', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Coffee Beans', 2000);
    const rows = listAsins(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ asin: 'B001', name: 'Coffee Beans', threshold_cents: 2000 });
    db.close();
  });

  it('updates name and threshold on conflict', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Old Name', 1000);
    upsertAsin(db, 'B001', 'New Name', 1500);
    const rows = listAsins(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'New Name', threshold_cents: 1500 });
    db.close();
  });

  it('lists multiple ASINs', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item A', 1000);
    upsertAsin(db, 'B002', 'Item B', 2000);
    expect(listAsins(db)).toHaveLength(2);
    db.close();
  });
});

describe('db.insertPricePoint / get7dAvgCents', () => {
  it('returns null when no price history exists', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    expect(get7dAvgCents(db, 'B001')).toBeNull();
    db.close();
  });

  it('computes average from inserted price points', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    insertPricePoint(db, 'B001', 2000, null, null);
    insertPricePoint(db, 'B001', 2200, null, null);
    insertPricePoint(db, 'B001', 1800, null, null);
    // avg = (2000 + 2200 + 1800) / 3 = 2000
    expect(get7dAvgCents(db, 'B001')).toBe(2000);
    db.close();
  });

  it('ignores null / zero prices when computing average', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    insertPricePoint(db, 'B001', null, 2000, null);
    insertPricePoint(db, 'B001', null, null, null);
    // Only the first point has a non-null price
    expect(get7dAvgCents(db, 'B001')).toBe(2000);
    db.close();
  });

  it('falls back to priceNew then priceUsed when priceAmazon is null', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    insertPricePoint(db, 'B001', null, 1500, null);
    insertPricePoint(db, 'B001', null, null, 1300);
    // avg = (1500 + 1300) / 2 = 1400
    expect(get7dAvgCents(db, 'B001')).toBe(1400);
    db.close();
  });

  it('excludes rows older than 7 days', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    // Insert an old row directly with a backdated recorded_at
    db.prepare(
      `INSERT INTO price_history (asin, recorded_at, price_amazon) VALUES (?, datetime('now', '-8 days'), ?)`,
    ).run('B001', 5000);
    insertPricePoint(db, 'B001', 2000, null, null);
    // Only the recent $20.00 row should count
    expect(get7dAvgCents(db, 'B001')).toBe(2000);
    db.close();
  });
});

describe('db.wasAlertedRecently / recordAlert', () => {
  it('returns false before any alert is recorded', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    expect(wasAlertedRecently(db, 'B001')).toBe(false);
    db.close();
  });

  it('returns true immediately after recording an alert', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    recordAlert(db, 'B001', 1800);
    expect(wasAlertedRecently(db, 'B001')).toBe(true);
    db.close();
  });

  it('returns false for an alert older than 24 hours', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item', 2000);
    db.prepare(
      `INSERT INTO alerts (asin, alerted_at, price_cents) VALUES (?, datetime('now', '-25 hours'), ?)`,
    ).run('B001', 1800);
    expect(wasAlertedRecently(db, 'B001')).toBe(false);
    db.close();
  });

  it('does not suppress alerts for a different ASIN', () => {
    const db = memDb();
    upsertAsin(db, 'B001', 'Item A', 2000);
    upsertAsin(db, 'B002', 'Item B', 2000);
    recordAlert(db, 'B001', 1800);
    expect(wasAlertedRecently(db, 'B002')).toBe(false);
    db.close();
  });
});
