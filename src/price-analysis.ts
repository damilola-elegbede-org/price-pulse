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
