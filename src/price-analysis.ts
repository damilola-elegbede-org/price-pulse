// Minimal shape required for price comparison — structurally compatible with
// PriceHistory from keepa/client so that array is assignable without casting.
export interface PriceDataPoint {
  priceAmazon: number | null; // USD cents
  priceNew: number | null;    // USD cents
  priceUsed: number | null;   // USD cents
}

export interface AlertDecision {
  should_alert: boolean;
  current_price: number; // USD cents; -1 when no price data is available
  threshold: number;     // USD cents
  drop_pct: number;      // (threshold - current_price) / threshold * 100; 0 when no data
}

function bestPrice(point: PriceDataPoint): number | null {
  return point.priceAmazon ?? point.priceNew ?? point.priceUsed;
}

/**
 * Determine whether to alert based on the latest price in a history array.
 *
 * **Integration contracts for ENG-330 (Telegram dispatcher):**
 *
 * - All monetary values — `history[*].price*`, `thresholdCents`, and the
 *   returned `current_price` / `threshold` — are **USD cents**, not dollars.
 *   Divide by 100 only at display time.
 *
 * - `current_price === -1` is a sentinel meaning "no price data was available
 *   in the history array". It is not a real price. Always check
 *   `should_alert` (which will be `false`) before reading `current_price`.
 *
 * - `drop_pct` is **positive** when the current price is below the threshold
 *   (a genuine drop worth alerting on) and **negative** when the price is
 *   above the threshold (no alert). The name reflects the intended use-case;
 *   treat a negative value as "price is N% over threshold".
 */
export function analyzePrice(
  history: PriceDataPoint[],
  thresholdCents: number,
): AlertDecision {
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const price = latest !== null ? bestPrice(latest) : null;

  if (price === null) {
    return { should_alert: false, current_price: -1, threshold: thresholdCents, drop_pct: 0 };
  }

  return {
    should_alert: price < thresholdCents,
    current_price: price,
    threshold: thresholdCents,
    drop_pct: ((thresholdCents - price) / thresholdCents) * 100,
  };
}
