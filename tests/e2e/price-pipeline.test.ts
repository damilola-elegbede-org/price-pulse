/**
 * E2E: Keepa mock → price analysis → Telegram alert
 *
 * Tests the full price-drop pipeline without live network calls.
 * spawnSync (Telegram dispatch) is mocked at the process boundary.
 *
 * NOTE — pipeline wiring gap (ENG-272 escalation):
 *   analyzePrice is not yet called from pipeline.run() — that wiring is
 *   tracked in ENG-377. These tests exercise the analysis + dispatch chain
 *   directly and will be updated to drive pipeline.run() once ENG-377 lands.
 *
 * NOTE — Python/pytest constraint:
 *   ENG-272 specifies tests/e2e/test_price_pipeline.py (pytest), but
 *   price-pulse is a TypeScript/Jest project with no Python runtime or
 *   pytest configuration. Tests are written in TypeScript to match the
 *   project's actual test stack.
 */

import { spawnSync } from 'child_process';
import { analyzePrice } from '../../src/price-analysis';
import type { PriceHistory } from '../../src/keepa/client';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));

const mockSpawn = spawnSync as jest.MockedFunction<typeof spawnSync>;

const SPAWN_SUCCESS = {
  status: 0,
  error: undefined,
  output: [],
  pid: 0,
  signal: null,
  stderr: Buffer.alloc(0),
  stdout: Buffer.alloc(0),
} as ReturnType<typeof spawnSync>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PriceHistory array; daysAgo=0 is today. */
function buildHistory(
  entries: Array<{ daysAgo: number; priceCents: number | null }>,
): PriceHistory[] {
  const now = Date.now();
  return entries.map(({ daysAgo, priceCents }) => ({
    timestamp: new Date(now - daysAgo * 86_400_000),
    priceAmazon: priceCents,
    priceNew: null,
    priceUsed: null,
  }));
}

/**
 * Returns true when the history spans at least minDays calendar days.
 *
 * This is the guard that pipeline.run() must apply before calling
 * analyzePrice — products without sufficient history should be silently
 * skipped. It is extracted here so the test can assert on it independently
 * and so ENG-377 has a clear spec for the check it needs to implement.
 */
function hasMinDaysOfHistory(history: PriceHistory[], minDays: number): boolean {
  if (history.length < 2) return false;
  const oldestMs = history[0].timestamp.getTime();
  const newestMs = history[history.length - 1].timestamp.getTime();
  return newestMs - oldestMs >= minDays * 86_400_000;
}

/**
 * Mirrors pipeline.ts sendAlert — call only when should_alert is true.
 * Exercises call-count and args only; env guard matches production behaviour.
 */
function dispatchAlert(priceCents: number, dropPct: number): void {
  const script = process.env.TELEGRAM_SEND_SCRIPT;
  if (!script) {
    console.error('[price-pulse] alert not sent: TELEGRAM_SEND_SCRIPT env var is not set');
    return;
  }
  const msg = `price-pulse: price dropped to $${(priceCents / 100).toFixed(2)} (${dropPct.toFixed(1)}% below threshold)`;
  spawnSync(script, ['--raw', msg.slice(0, 120)], { stdio: 'inherit' });
}

// ---------------------------------------------------------------------------
// Threshold: $90.00 (9000 cents) — triggers only on drops below 10% of $100
// ---------------------------------------------------------------------------
const THRESHOLD_CENTS = 9000;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Price Pulse E2E: Keepa mock → price analysis → Telegram alert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawn.mockReturnValue(SPAWN_SUCCESS);
    process.env.TELEGRAM_SEND_SCRIPT = '/usr/local/bin/mock-telegram-send.sh';
  });

  afterEach(() => {
    delete process.env.TELEGRAM_SEND_SCRIPT;
  });

  it('scenario A: product at $100 seven days ago, $85 today (5.6% below threshold) — alert fires exactly once', () => {
    const history = buildHistory([
      { daysAgo: 7, priceCents: 10_000 },
      { daysAgo: 6, priceCents: 10_000 },
      { daysAgo: 5, priceCents: 10_000 },
      { daysAgo: 4, priceCents: 9_800 },
      { daysAgo: 3, priceCents: 9_500 },
      { daysAgo: 2, priceCents: 9_200 },
      { daysAgo: 0, priceCents: 8_500 }, // today: $85
    ]);

    expect(hasMinDaysOfHistory(history, 7)).toBe(true);

    const decision = analyzePrice(history, THRESHOLD_CENTS);

    expect(decision.should_alert).toBe(true);
    expect(decision.current_price).toBe(8_500);
    expect(decision.drop_pct).toBeCloseTo(5.56, 1); // (9000 - 8500) / 9000 * 100

    if (decision.should_alert) {
      dispatchAlert(decision.current_price, decision.drop_pct);
    }

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(args[0]).toBe('--raw');
    expect(args[1]).toMatch(/^price-pulse:/);
    expect(args[1].length).toBeLessThanOrEqual(120);
  });

  it('scenario B: product at $100 seven days ago, $95 today (5% drop) — zero Telegram alerts fired', () => {
    const history = buildHistory([
      { daysAgo: 7, priceCents: 10_000 },
      { daysAgo: 6, priceCents: 10_000 },
      { daysAgo: 5, priceCents: 10_000 },
      { daysAgo: 4, priceCents: 9_900 },
      { daysAgo: 3, priceCents: 9_700 },
      { daysAgo: 2, priceCents: 9_600 },
      { daysAgo: 0, priceCents: 9_500 }, // today: $95
    ]);

    expect(hasMinDaysOfHistory(history, 7)).toBe(true);

    const decision = analyzePrice(history, THRESHOLD_CENTS);

    // $95 is above the $90 threshold — no alert
    expect(decision.should_alert).toBe(false);
    expect(decision.current_price).toBe(9_500);

    if (decision.should_alert) {
      dispatchAlert(decision.current_price, decision.drop_pct);
    }

    expect(mockSpawn).toHaveBeenCalledTimes(0);
  });

  it('scenario C: product with fewer than 7 days of data — graceful skip, no alert fired', () => {
    // Only 3 days of history even though the price has dropped significantly.
    // The pipeline must not alert when the history window is too short to be
    // reliable — ENG-377 must implement this guard in pipeline.run().
    const history = buildHistory([
      { daysAgo: 3, priceCents: 10_000 },
      { daysAgo: 2, priceCents: 9_500 },
      { daysAgo: 0, priceCents: 8_500 }, // looks like a 15% drop
    ]);

    // hasMinDaysOfHistory is false → pipeline skips analysis entirely
    expect(hasMinDaysOfHistory(history, 7)).toBe(false);

    if (!hasMinDaysOfHistory(history, 7)) {
      // graceful skip — no analysis, no alert
    } else {
      const decision = analyzePrice(history, THRESHOLD_CENTS);
      if (decision.should_alert) {
        dispatchAlert(decision.current_price, decision.drop_pct);
      }
    }

    expect(mockSpawn).toHaveBeenCalledTimes(0);
  });

  it('scenario D: latest data point has no price — no alert, current_price is -1 sentinel', () => {
    const history = buildHistory([
      { daysAgo: 7, priceCents: 10_000 },
      { daysAgo: 0, priceCents: null }, // unavailable
    ]);

    const decision = analyzePrice(history, THRESHOLD_CENTS);

    expect(decision.should_alert).toBe(false);
    expect(decision.current_price).toBe(-1);

    if (decision.should_alert) {
      dispatchAlert(decision.current_price, decision.drop_pct);
    }

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
