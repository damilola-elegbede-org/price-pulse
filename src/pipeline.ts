import { spawnSync } from 'child_process';
import { accessSync, constants } from 'fs';
import { getProductHistory } from './keepa/client';
import { analyzePrice, AlertDecision } from './price-analysis';

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

export async function run(asin: string, thresholdCents: number): Promise<AlertDecision | false> {
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
  return analyzePrice(history, thresholdCents);
}

if (require.main === module) {
  const asin = process.env.ASIN;
  if (!asin) {
    console.error('ASIN environment variable is required');
    process.exit(1);
  }
  const thresholdRaw = process.env.THRESHOLD_CENTS;
  if (!thresholdRaw) {
    console.error('THRESHOLD_CENTS environment variable is required');
    process.exit(1);
  }
  const thresholdCents = parseInt(thresholdRaw, 10);
  if (isNaN(thresholdCents) || thresholdCents <= 0) {
    console.error('THRESHOLD_CENTS must be a positive integer');
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
  run(asin, thresholdCents).then(result => {
    if (!result) process.exit(1);
  }).catch(err => {
    console.error('Unexpected pipeline error:', err);
    process.exit(1);
  });
}
