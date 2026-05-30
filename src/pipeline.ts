import { spawnSync } from 'child_process';
import { accessSync, constants } from 'fs';
import { getProductHistory } from './keepa/client';
import { analyzePrice, AlertDecision, PriceDataPoint } from './price-analysis';

function sendAlert(message: string): void {
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

// Resolve the price threshold in cents used to decide whether to fire an alert.
// Priority: PRICE_THRESHOLD_CENTS (absolute) → dynamic (PRICE_DROP_PCT% below penultimate price).
// Returns 0 when a threshold cannot be determined (no alert fired).
function resolveThresholdCents(history: PriceDataPoint[]): number {
  const configured = process.env.PRICE_THRESHOLD_CENTS;
  if (configured) {
    const cents = parseInt(configured, 10);
    if (Number.isFinite(cents) && cents > 0) return cents;
  }
  // Dynamic: fire when latest price drops ≥ PRICE_DROP_PCT% below the penultimate observation.
  // Requires at least two history points to establish a baseline.
  if (history.length < 2) return 0;
  const dropPct = parseFloat(process.env.PRICE_DROP_PCT ?? '10');
  const penultimate = history[history.length - 2];
  const base = penultimate.priceAmazon ?? penultimate.priceNew ?? penultimate.priceUsed;
  if (base === null || base <= 0) return 0;
  return Math.round(base * (1 - dropPct / 100));
}

function dispatchPriceAlert(asin: string, decision: AlertDecision): void {
  const script = process.env.TELEGRAM_SEND_SCRIPT;
  if (!script) {
    console.error('[price-pulse] price alert not sent: TELEGRAM_SEND_SCRIPT env var is not set');
    return;
  }
  const name = process.env.PRODUCT_NAME ?? asin;
  const current = (decision.current_price / 100).toFixed(2);
  const was = (decision.threshold / 100).toFixed(2);
  const pct = decision.drop_pct.toFixed(1);
  const url = `https://www.amazon.com/dp/${asin}`;
  const message = `price-pulse: ${name} dropped to $${current} (was $${was}, down ${pct}%) ${url}`;
  const result = spawnSync(script, [message], { stdio: 'inherit' });
  if (result.error || (result.status !== null && result.status !== 0)) {
    console.error(`[price-pulse] price alert delivery failed (status=${result.status ?? 'null'}):`, result.error?.message ?? '');
  }
}

export async function run(asin: string): Promise<boolean> {
  let history;
  try {
    history = await getProductHistory(asin);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[keepa] fetch error:', detail);
    sendAlert('price-pulse: Keepa fetch failed — see pipeline logs');
    return false;
  }

  const thresholdCents = resolveThresholdCents(history);
  if (thresholdCents > 0) {
    const decision = analyzePrice(history, thresholdCents);
    if (decision.should_alert) {
      dispatchPriceAlert(asin, decision);
    }
  }

  console.log(`Fetched ${history.length} price points for ASIN ${asin}`);
  return true;
}

if (require.main === module) {
  const asin = process.env.ASIN;
  if (!asin) {
    console.error('ASIN environment variable is required');
    process.exit(1);
  }
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
  run(asin).then(ok => {
    if (!ok) process.exit(1);
  }).catch(err => {
    console.error('Unexpected pipeline error:', err);
    process.exit(1);
  });
}
