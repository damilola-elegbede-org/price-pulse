// Live end-to-end smoke test for Price Pulse pipeline.
// Requires KEEPA_API_KEY env var — all tests skip gracefully when the key is absent.
//
// Run locally:  KEEPA_API_KEY=<key> npx jest smoke.e2e
// Preconditions met in main: ENG-265 (Keepa client), ENG-377 (price analysis),
//                            ENG-462 (fetch-failure alerting)

import { getProductHistory, PriceHistory } from './keepa/client';
import { analyzePrice } from './price-analysis';
import { run } from './pipeline';

const LIVE_ASIN = 'B001E4KFG0'; // Lavazza Super Crema — consistent, always-listed product

// Threshold: $30.00 (3000 cents). Well above a typical coffee price so most
// runs produce should_alert=true, making the decision assertion meaningful.
const THRESHOLD_CENTS = 3000;

jest.setTimeout(30_000);

// All live tests gate on KEEPA_API_KEY; skip cleanly in CI without the secret.
const live = process.env.KEEPA_API_KEY ? describe : describe.skip;

live('Price Pulse E2E smoke — live Keepa API', () => {
  let history: PriceHistory[];

  beforeAll(async () => {
    history = await getProductHistory(LIVE_ASIN);
  });

  it('Keepa client returns a non-empty price history array', () => {
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it('each history entry has a valid PriceHistory shape', () => {
    for (const entry of history) {
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.timestamp.getTime()).not.toBeNaN();

      const checkField = (v: number | null): void => {
        if (v !== null) {
          expect(typeof v).toBe('number');
          expect(v).toBeGreaterThan(0);
        } else {
          expect(v).toBeNull();
        }
      };
      checkField(entry.priceAmazon);
      checkField(entry.priceNew);
      checkField(entry.priceUsed);
    }
  });

  it('latest price entry has at least one non-null price source', () => {
    const latest = history[history.length - 1];
    const hasPrice =
      latest.priceAmazon !== null ||
      latest.priceNew !== null ||
      latest.priceUsed !== null;
    expect(hasPrice).toBe(true);
  });

  it('analyzePrice produces a valid AlertDecision from live data', () => {
    const decision = analyzePrice(history, THRESHOLD_CENTS);

    expect(typeof decision.should_alert).toBe('boolean');
    expect(decision.threshold).toBe(THRESHOLD_CENTS);
    expect(typeof decision.drop_pct).toBe('number');
    // current_price is either a real USD-cent price or the -1 sentinel (no data)
    expect(decision.current_price === -1 || decision.current_price > 0).toBe(true);
    // If a price was found, should_alert reflects whether it is below threshold
    if (decision.current_price !== -1) {
      expect(decision.should_alert).toBe(decision.current_price < THRESHOLD_CENTS);
    }
  });

  it('pipeline.run returns true for a valid ASIN (full fetch → log path)', async () => {
    const result = await run(LIVE_ASIN);
    expect(result).toBe(true);
  });
});
