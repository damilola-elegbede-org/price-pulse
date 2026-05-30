import { spawnSync } from 'child_process';
import { accessSync, constants, realpathSync } from 'fs';
import type { Database } from 'better-sqlite3';
import { getProductHistory } from './keepa/client';
import { analyzePrice } from './price-analysis';
import {
  listAsins,
  insertPricePoint,
  get7dAvgCents,
  wasAlertedRecently,
  recordAlert,
} from './db';

export function sendAlert(message: string): void {
  const script = process.env.TELEGRAM_SEND_SCRIPT;
  if (!script) {
    console.error('[price-pulse] alert not sent: TELEGRAM_SEND_SCRIPT env var is not set');
    return;
  }
  const result = spawnSync(script, ['--raw', message.slice(0, 120)], { stdio: 'inherit' });
  if (result.error || (result.status !== null && result.status !== 0)) {
    console.error(`[price-pulse] alert delivery failed (status=${result.status ?? 'null'}):`, result.error?.message ?? '');
  }
}

export async function run(asin: string, db?: Database, thresholdCents?: number): Promise<boolean> {
  let history;
  try {
    history = await getProductHistory(asin);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[keepa] fetch error:', detail);
    sendAlert('price-pulse: Keepa fetch failed — see pipeline logs');
    return false;
  }
  console.log(`Fetched ${history.length} price points for ASIN ${asin}`);

  if (db && history.length > 0) {
    const latest = history[history.length - 1];

    // Fetch historical baseline BEFORE inserting the current observation so the
    // newly-inserted row does not skew the average used for display context.
    const avg7d = get7dAvgCents(db, asin);
    insertPricePoint(db, asin, latest.priceAmazon, latest.priceNew, latest.priceUsed);

    if (thresholdCents !== undefined) {
      const decision = analyzePrice([latest], thresholdCents);

      if (decision.should_alert && !wasAlertedRecently(db, asin)) {
        const priceDollars = (decision.current_price / 100).toFixed(2);
        const threshDollars = (thresholdCents / 100).toFixed(2);
        const avgPart = avg7d !== null ? `, 7d avg $${(avg7d / 100).toFixed(2)}` : '';
        sendAlert(`price-pulse: ${asin} now $${priceDollars} (target $${threshDollars}${avgPart})`);
        recordAlert(db, asin, decision.current_price);
      }
    }
  }

  return true;
}

export async function runAll(db: Database): Promise<boolean> {
  const asins = listAsins(db);
  if (asins.length === 0) {
    console.log('[price-pulse] no tracked ASINs');
    return true;
  }
  const results: boolean[] = [];
  for (const row of asins) {
    results.push(await run(row.asin, db, row.threshold_cents));
  }
  return results.every(ok => ok);
}

if (require.main === module) {
  const script = process.env.TELEGRAM_SEND_SCRIPT;
  if (!script) {
    console.error('TELEGRAM_SEND_SCRIPT environment variable is required');
    process.exit(1);
  }
  try {
    accessSync(script, constants.X_OK);
  } catch {
    console.error(`TELEGRAM_SEND_SCRIPT=${script} is not executable`);
    process.exit(1);
  }
  try {
    if (!realpathSync(script).startsWith('/Users/daelegbe/BareClaude/')) {
      console.error(`TELEGRAM_SEND_SCRIPT must be under /Users/daelegbe/BareClaude/`);
      process.exit(1);
    }
  } catch {
    console.error(`TELEGRAM_SEND_SCRIPT=${script} could not be resolved`);
    process.exit(1);
  }

  const { openDb } = require('./db') as typeof import('./db');
  const dbPath = process.env.DB_PATH ?? 'price-pulse.db';
  const db = openDb(dbPath);

  runAll(db).then(ok => {
    if (!ok) process.exit(1);
  }).catch(err => {
    console.error('Unexpected pipeline error:', err);
    process.exit(1);
  });
}
