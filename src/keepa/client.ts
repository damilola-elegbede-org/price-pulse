// Keepa time epoch: minutes since 2011-01-01T00:00:00 UTC
const KEEPA_EPOCH_MS = Date.UTC(2011, 0, 1);

export interface PriceHistory {
  timestamp: Date;
  priceAmazon: number | null; // USD cents; null = out of stock
  priceNew: number | null;    // USD cents; null = out of stock
  priceUsed: number | null;   // USD cents; null = out of stock
}

interface KeepaProduct {
  asin: string;
  csv: (number[] | null | undefined)[];
}

interface KeepaResponse {
  products: KeepaProduct[];
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(capacity: number, tokensPerMinute: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.refillRate = tokensPerMinute / 60_000;
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (now - this.lastRefill) * this.refillRate,
    );
    this.lastRefill = now;
  }

  async consume(count: number): Promise<void> {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }
    const waitMs = Math.ceil((count - this.tokens) / this.refillRate);
    await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= count;
  }
}

// Module-level bucket: 20 tok/min matching the Keepa €49/mo plan
const _bucket = new TokenBucket(20, 20);

function keepaTimeToDate(keepaMinutes: number): Date {
  return new Date(KEEPA_EPOCH_MS + keepaMinutes * 60_000);
}

// Keepa csv: interleaved [time, priceCents, time, priceCents, ...]
// price <= 0 means out of stock or not tracked → null
function parseCsv(csv: number[] | null | undefined): Map<number, number | null> {
  const result = new Map<number, number | null>();
  if (!csv) return result;
  for (let i = 0; i + 1 < csv.length; i += 2) {
    result.set(csv[i], csv[i + 1] > 0 ? csv[i + 1] : null);
  }
  return result;
}

function buildPriceHistory(product: KeepaProduct): PriceHistory[] {
  const csv = product.csv ?? [];
  const amazonMap = parseCsv(csv[0]);
  const newMap    = parseCsv(csv[1]);
  const usedMap   = parseCsv(csv[2]);

  const allTimes = new Set<number>([
    ...amazonMap.keys(),
    ...newMap.keys(),
    ...usedMap.keys(),
  ]);

  const sorted = [...allTimes].sort((a, b) => a - b);

  let lastAmazon: number | null = null;
  let lastNew:    number | null = null;
  let lastUsed:   number | null = null;

  return sorted.map(t => {
    const a = amazonMap.get(t);
    if (a !== undefined) lastAmazon = a;
    const n = newMap.get(t);
    if (n !== undefined) lastNew = n;
    const u = usedMap.get(t);
    if (u !== undefined) lastUsed = u;

    return {
      timestamp:    keepaTimeToDate(t),
      priceAmazon:  lastAmazon,
      priceNew:     lastNew,
      priceUsed:    lastUsed,
    };
  });
}

export async function getProductHistory(asin: string): Promise<PriceHistory[]> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    throw new Error('KEEPA_API_KEY environment variable is not set');
  }

  await _bucket.consume(1);

  const url = new URL('https://api.keepa.com/product');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('domain', '1'); // 1 = amazon.com
  url.searchParams.set('asin', asin);
  url.searchParams.set('history', '1');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Keepa API error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as KeepaResponse;
  if (!data.products?.length) {
    throw new Error(`No product found for ASIN: ${asin}`);
  }

  return buildPriceHistory(data.products[0]);
}
