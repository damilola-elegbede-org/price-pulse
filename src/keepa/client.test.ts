import { TokenBucket, getProductHistory, PriceHistory } from './client';

// ── helpers ──────────────────────────────────────────────────────────────────

function keepaMs(keepaMinutes: number): number {
  return Date.UTC(2011, 0, 1) + keepaMinutes * 60_000;
}

function mockFetch(body: unknown, ok = true, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  } as unknown as Response);
}

// ── TokenBucket ───────────────────────────────────────────────────────────────

describe('TokenBucket', () => {
  it('resolves immediately when tokens are available', async () => {
    const bucket = new TokenBucket(5, 300);
    await expect(bucket.consume(3)).resolves.toBeUndefined();
  });

  it('waits when bucket is exhausted and resolves after refill', async () => {
    jest.useFakeTimers();
    try {
      // 1 token capacity, refills at 1 token/second
      const bucket = new TokenBucket(1, 60);
      await bucket.consume(1); // drain

      let resolved = false;
      const p = bucket.consume(1).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      // Advance past the 1-second refill window
      await jest.advanceTimersByTimeAsync(1100);
      await p;

      expect(resolved).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('caps tokens at capacity during refill', async () => {
    jest.useFakeTimers();
    try {
      const bucket = new TokenBucket(3, 180); // 3 tok cap, refills 3/min
      // Drain 2 tokens
      await bucket.consume(2);
      // Advance 10 minutes — would overfill without capping
      await jest.advanceTimersByTimeAsync(600_000);
      // Should still be able to consume 3 (cap) without waiting
      await expect(bucket.consume(3)).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

// ── getProductHistory ─────────────────────────────────────────────────────────

const ASIN = 'B001E4KFG0';

// Keepa csv fixture:
//   csv[0] Amazon:  t=100 → $12.99, t=200 → $9.99, t=300 → out-of-stock (-1)
//   csv[1] New:     t=150 → $10.99, t=250 → $8.99
//   csv[2] Used:    null (no history)
const MOCK_PRODUCT = {
  asin: ASIN,
  csv: [
    [100, 1299, 200, 999, 300, -1],
    [150, 1099, 250, 899],
    null,
  ],
};

describe('getProductHistory', () => {
  beforeEach(() => {
    process.env.KEEPA_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.KEEPA_API_KEY;
    jest.restoreAllMocks();
  });

  // ── success path ────────────────────────────────────────────────────────────

  it('returns a PriceHistory array for a valid ASIN', async () => {
    mockFetch({ products: [MOCK_PRODUCT] });

    const history = await getProductHistory(ASIN);

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it('maps Keepa timestamps to JS Dates correctly', async () => {
    mockFetch({ products: [{ asin: ASIN, csv: [[0, 500], null, null] }] });

    const history = await getProductHistory(ASIN);

    expect(history[0].timestamp.getTime()).toBe(Date.UTC(2011, 0, 1));
  });

  it('converts price cents correctly and marks out-of-stock as null', async () => {
    mockFetch({ products: [MOCK_PRODUCT] });

    const history = await getProductHistory(ASIN);

    const entry100 = history.find(h => h.timestamp.getTime() === keepaMs(100));
    expect(entry100?.priceAmazon).toBe(1299);

    const entry300 = history.find(h => h.timestamp.getTime() === keepaMs(300));
    expect(entry300?.priceAmazon).toBeNull();
  });

  it('forward-fills prices across time points from different csv arrays', async () => {
    mockFetch({ products: [MOCK_PRODUCT] });

    const history = await getProductHistory(ASIN);

    // At t=150 (new price changes), amazon price from t=100 should be carried forward
    const entry150 = history.find(h => h.timestamp.getTime() === keepaMs(150));
    expect(entry150?.priceAmazon).toBe(1299);
    expect(entry150?.priceNew).toBe(1099);
  });

  it('returns null for price types with no csv data', async () => {
    mockFetch({ products: [MOCK_PRODUCT] });

    const history = await getProductHistory(ASIN);

    // csv[2] is null → usedPrice should always be null
    expect(history.every(h => h.priceUsed === null)).toBe(true);
  });

  it('calls the Keepa API with correct query params', async () => {
    mockFetch({ products: [MOCK_PRODUCT] });

    await getProductHistory(ASIN);

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    const parsed = new URL(calledUrl);
    expect(parsed.hostname).toBe('api.keepa.com');
    expect(parsed.pathname).toBe('/product');
    expect(parsed.searchParams.get('key')).toBe('test-key');
    expect(parsed.searchParams.get('asin')).toBe(ASIN);
    expect(parsed.searchParams.get('domain')).toBe('1');
    expect(parsed.searchParams.get('history')).toBe('1');
  });

  // ── error paths ─────────────────────────────────────────────────────────────

  it('throws when KEEPA_API_KEY is not set', async () => {
    delete process.env.KEEPA_API_KEY;

    await expect(getProductHistory(ASIN)).rejects.toThrow('KEEPA_API_KEY');
  });

  it('throws on non-2xx HTTP response', async () => {
    mockFetch(null, false, 400);

    await expect(getProductHistory(ASIN)).rejects.toThrow('HTTP 400');
  });

  it('throws when the API returns an empty products array', async () => {
    mockFetch({ products: [] });

    await expect(getProductHistory(ASIN)).rejects.toThrow(ASIN);
  });

  it('throws when the API returns no products field', async () => {
    mockFetch({});

    await expect(getProductHistory(ASIN)).rejects.toThrow(ASIN);
  });
});
