import { openDb, insertPriceHistory, upsertAlertConfig, insertAlertLog, getAlertConfig, getPriceHistory } from './db';

const ASIN = 'B001E4KFG0';

function freshDb() {
  return openDb(':memory:');
}

describe('openDb — schema migration', () => {
  it('creates price_history table', () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='price_history'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('price_history');
    db.close();
  });

  it('creates alert_config table', () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_config'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('alert_config');
    db.close();
  });

  it('creates alert_log table', () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alert_log'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('alert_log');
    db.close();
  });

  it('is idempotent — running migration twice does not throw', () => {
    const db = freshDb();
    expect(() => {
      const { readFileSync } = require('fs');
      const { join } = require('path');
      const sql = readFileSync(join(__dirname, '..', 'db', 'migrations', '001_init.sql'), 'utf8');
      db.exec(sql);
    }).not.toThrow();
    db.close();
  });
});

describe('price_history', () => {
  it('inserts and retrieves a row with default currency', () => {
    const db = freshDb();
    insertPriceHistory(db, ASIN, 1_700_000_000, 1999);
    const rows = getPriceHistory(db, ASIN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ asin: ASIN, timestamp: 1_700_000_000, price: 1999, currency: 'USD' });
    db.close();
  });

  it('inserts a row with explicit currency', () => {
    const db = freshDb();
    insertPriceHistory(db, ASIN, 1_700_000_000, 1899, 'CAD');
    const rows = getPriceHistory(db, ASIN);
    expect(rows[0].currency).toBe('CAD');
    db.close();
  });

  it('returns rows ordered by timestamp ascending', () => {
    const db = freshDb();
    insertPriceHistory(db, ASIN, 1_700_000_002, 2100);
    insertPriceHistory(db, ASIN, 1_700_000_001, 2000);
    const rows = getPriceHistory(db, ASIN);
    expect(rows[0].timestamp).toBe(1_700_000_001);
    expect(rows[1].timestamp).toBe(1_700_000_002);
    db.close();
  });
});

describe('alert_config', () => {
  it('inserts a config row and retrieves it', () => {
    const db = freshDb();
    upsertAlertConfig(db, ASIN, 1800, true);
    const row = getAlertConfig(db, ASIN);
    expect(row).toMatchObject({ asin: ASIN, threshold: 1800, enabled: 1 });
    db.close();
  });

  it('upserts an existing config row', () => {
    const db = freshDb();
    upsertAlertConfig(db, ASIN, 1800, true);
    upsertAlertConfig(db, ASIN, 1500, false);
    const row = getAlertConfig(db, ASIN);
    expect(row).toMatchObject({ asin: ASIN, threshold: 1500, enabled: 0 });
    db.close();
  });

  it('returns undefined for unknown asin', () => {
    const db = freshDb();
    expect(getAlertConfig(db, 'UNKNOWN')).toBeUndefined();
    db.close();
  });

  it('rejects enabled values outside 0/1', () => {
    const db = freshDb();
    expect(() =>
      db.prepare('INSERT INTO alert_config (asin, threshold, enabled) VALUES (?, ?, ?)').run(ASIN, 1800, 2),
    ).toThrow();
    db.close();
  });
});

describe('alert_log', () => {
  it('inserts an alert log row', () => {
    const db = freshDb();
    insertAlertLog(db, ASIN, 1_700_000_000, 1750);
    const rows = db.prepare('SELECT * FROM alert_log WHERE asin = ?').all(ASIN) as {
      id: number; asin: string; alert_ts: number; price_at_alert: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ asin: ASIN, alert_ts: 1_700_000_000, price_at_alert: 1750 });
    db.close();
  });

  it('accumulates multiple log rows for the same asin', () => {
    const db = freshDb();
    insertAlertLog(db, ASIN, 1_700_000_000, 1750);
    insertAlertLog(db, ASIN, 1_700_000_001, 1700);
    const rows = db.prepare('SELECT * FROM alert_log WHERE asin = ?').all(ASIN);
    expect(rows).toHaveLength(2);
    db.close();
  });
});
