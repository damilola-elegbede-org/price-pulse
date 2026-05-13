import { spawnSync } from 'child_process';
import { getProductHistory } from './keepa/client';

const TELEGRAM_SEND_SCRIPT = process.env.TELEGRAM_SEND_SCRIPT
  ?? '/Users/daelegbe/BareClaude/clara/scripts/telegram-send.sh';

function sendAlert(message: string): void {
  spawnSync(TELEGRAM_SEND_SCRIPT, ['--raw', message.slice(0, 120)], { stdio: 'inherit' });
}

export async function run(asin: string): Promise<boolean> {
  let history;
  try {
    history = await getProductHistory(asin);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    sendAlert(`price-pulse: Keepa fetch failed — ${detail}`);
    return false;
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
  run(asin).then(ok => {
    if (!ok) process.exit(1);
  }).catch(err => {
    console.error('Unexpected pipeline error:', err);
    process.exit(1);
  });
}
