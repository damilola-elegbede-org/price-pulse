import { spawnSync } from 'child_process';
import { accessSync, constants } from 'fs';
import { getProductHistory, KeepaRateLimitError } from './keepa/client';

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

export async function run(asin: string): Promise<boolean> {
  let history;
  try {
    history = await getProductHistory(asin);
  } catch (err: unknown) {
    if (err instanceof KeepaRateLimitError) {
      throw err; // Let runBatch aggregate rate-limit errors; don't send generic alert
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[keepa] fetch error:', detail);
    sendAlert('price-pulse: Keepa fetch failed — see pipeline logs');
    return false;
  }
  console.log(`Fetched ${history.length} price points for ASIN ${asin}`);
  return true;
}

export async function runBatch(
  asins: string[],
  slackPostScript = process.env.SLACK_POST_SCRIPT ?? './scripts/slack-post.sh',
): Promise<{ ok: number; rateLimited: string[] }> {
  const rateLimited: string[] = [];
  let ok = 0;

  for (const asin of asins) {
    try {
      const success = await run(asin);
      if (success) ok++;
    } catch (err) {
      if (err instanceof KeepaRateLimitError) {
        rateLimited.push(asin);
      }
    }
  }

  if (rateLimited.length >= 3) {
    const msg = `Price Pulse: Keepa rate limit hit — ${rateLimited.length} products skipped`;
    spawnSync(slackPostScript, ['post', 'alerts', msg, 'dara'], { stdio: 'inherit' });
  }

  return { ok, rateLimited };
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
