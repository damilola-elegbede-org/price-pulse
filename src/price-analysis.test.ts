import { analyzePrice, AlertDecision, PriceDataPoint } from './price-analysis';

function point(
  priceAmazon: number | null,
  priceNew: number | null = null,
  priceUsed: number | null = null,
): PriceDataPoint {
  return { priceAmazon, priceNew, priceUsed };
}

const THRESHOLD = 2000; // $20.00

describe('analyzePrice', () => {
  // ── threshold comparison ────────────────────────────────────────────────────

  it('returns should_alert false when price is above threshold', () => {
    const result = analyzePrice([point(2500)], THRESHOLD);
    expect(result.should_alert).toBe(false);
    expect(result.current_price).toBe(2500);
    expect(result.threshold).toBe(THRESHOLD);
    expect(result.drop_pct).toBeCloseTo(-25, 5); // price is 25% above threshold
  });

  it('returns should_alert false when price equals threshold exactly', () => {
    const result = analyzePrice([point(2000)], THRESHOLD);
    expect(result.should_alert).toBe(false);
    expect(result.current_price).toBe(2000);
    expect(result.drop_pct).toBe(0);
  });

  it('returns should_alert true when price is below threshold', () => {
    const result = analyzePrice([point(1500)], THRESHOLD);
    expect(result.should_alert).toBe(true);
    expect(result.current_price).toBe(1500);
    expect(result.threshold).toBe(THRESHOLD);
    expect(result.drop_pct).toBeCloseTo(25, 5); // 25% below threshold
  });

  // ── missing / null price data ───────────────────────────────────────────────

  it('returns should_alert false when history is empty', () => {
    const result = analyzePrice([], THRESHOLD);
    expect(result.should_alert).toBe(false);
    expect(result.current_price).toBe(-1);
    expect(result.threshold).toBe(THRESHOLD);
    expect(result.drop_pct).toBe(0);
  });

  it('returns should_alert false when all price fields are null', () => {
    const result = analyzePrice([point(null, null, null)], THRESHOLD);
    expect(result.should_alert).toBe(false);
    expect(result.current_price).toBe(-1);
    expect(result.drop_pct).toBe(0);
  });

  it('treats -1 (Keepa unavailable sentinel) as no price data', () => {
    const result = analyzePrice([point(-1, null, null)], THRESHOLD);
    expect(result.should_alert).toBe(false);
    expect(result.current_price).toBe(-1);
    expect(result.drop_pct).toBe(0);
  });

  it('returns should_alert false when thresholdCents is zero', () => {
    const result = analyzePrice([point(500)], 0);
    expect(result.should_alert).toBe(false);
    expect(result.drop_pct).toBe(0);
  });

  // ── price-field preference ──────────────────────────────────────────────────

  it('uses priceAmazon when available', () => {
    const result = analyzePrice([point(1500, 1200, 1000)], THRESHOLD);
    expect(result.current_price).toBe(1500);
  });

  it('falls back to priceNew when priceAmazon is null', () => {
    const result = analyzePrice([point(null, 1200, 1000)], THRESHOLD);
    expect(result.current_price).toBe(1200);
  });

  it('falls back to priceUsed when both priceAmazon and priceNew are null', () => {
    const result = analyzePrice([point(null, null, 900)], THRESHOLD);
    expect(result.current_price).toBe(900);
    expect(result.should_alert).toBe(true);
  });

  // ── uses most recent entry ──────────────────────────────────────────────────

  it('evaluates the last entry in history, not an earlier one', () => {
    const history = [point(2500), point(2200), point(1800)];
    const result = analyzePrice(history, THRESHOLD);
    expect(result.should_alert).toBe(true);
    expect(result.current_price).toBe(1800);
  });

  it('does not alert when last entry is above threshold despite earlier drops', () => {
    const history = [point(1500), point(2500)];
    const result = analyzePrice(history, THRESHOLD);
    expect(result.should_alert).toBe(false);
    expect(result.current_price).toBe(2500);
  });
});
