import { spawnSync } from 'child_process';
import { getProductHistory } from './keepa/client';
import { run } from './pipeline';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('./keepa/client', () => ({ getProductHistory: jest.fn() }));

const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockGetProductHistory = getProductHistory as jest.MockedFunction<typeof getProductHistory>;

const ASIN = 'B001E4KFG0';

const SPAWN_SUCCESS = {
  status: 0,
  error: undefined,
  output: [],
  pid: 0,
  signal: null,
  stderr: Buffer.alloc(0),
  stdout: Buffer.alloc(0),
} as ReturnType<typeof spawnSync>;

describe('pipeline.run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSync.mockReturnValue(SPAWN_SUCCESS);
    process.env.TELEGRAM_SEND_SCRIPT = 'mock-telegram-send.sh';
  });

  afterEach(() => {
    delete process.env.TELEGRAM_SEND_SCRIPT;
  });

  it('returns false and sends generic Telegram alert on non-2xx HTTP error', async () => {
    mockGetProductHistory.mockRejectedValue(new Error('Keepa API error: HTTP 429'));
    const result = await run(ASIN);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', 'price-pulse: Keepa fetch failed — see pipeline logs'],
      { stdio: 'inherit' },
    );
  });

  it('returns false and sends generic Telegram alert when response has no products', async () => {
    mockGetProductHistory.mockRejectedValue(new Error(`No product found for ASIN: ${ASIN}`));
    const result = await run(ASIN);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', 'price-pulse: Keepa fetch failed — see pipeline logs'],
      { stdio: 'inherit' },
    );
  });

  it('returns false and sends generic Telegram alert on invalid JSON response', async () => {
    mockGetProductHistory.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    const result = await run(ASIN);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', 'price-pulse: Keepa fetch failed — see pipeline logs'],
      { stdio: 'inherit' },
    );
  });

  it('logs error detail to stderr and omits it from the Telegram message', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetProductHistory.mockRejectedValue(new Error('sensitive-api-key=abc123'));
    await run(ASIN);
    expect(consoleSpy).toHaveBeenCalledWith('[keepa] fetch error:', 'sensitive-api-key=abc123');
    const sentMsg = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sentMsg).not.toContain('sensitive-api-key=abc123');
    consoleSpy.mockRestore();
  });

  it('prefixes the alert with "price-pulse:"', async () => {
    mockGetProductHistory.mockRejectedValue(new Error('HTTP 503'));
    await run(ASIN);
    const sentMsg = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sentMsg).toMatch(/^price-pulse:/);
  });

  it('logs to stderr when alert delivery fails', async () => {
    mockSpawnSync.mockReturnValue({ ...SPAWN_SUCCESS, status: 1 });
    mockGetProductHistory.mockRejectedValue(new Error('HTTP 503'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await run(ASIN);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[price-pulse] alert delivery failed'),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it('does not call spawnSync and logs to stderr when TELEGRAM_SEND_SCRIPT is not set', async () => {
    delete process.env.TELEGRAM_SEND_SCRIPT;
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetProductHistory.mockRejectedValue(new Error('HTTP 429'));
    await run(ASIN);
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('TELEGRAM_SEND_SCRIPT'));
    consoleSpy.mockRestore();
  });

  it('returns true and does not send any alert on successful fetch', async () => {
    mockGetProductHistory.mockResolvedValue([]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});

describe('pipeline.run — price-drop alert', () => {
  const THRESHOLD_CENTS = 2000; // $20.00

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSync.mockReturnValue(SPAWN_SUCCESS);
    process.env.TELEGRAM_SEND_SCRIPT = 'mock-telegram-send.sh';
    process.env.PRICE_THRESHOLD_CENTS = String(THRESHOLD_CENTS);
    process.env.PRODUCT_NAME = 'Test Coffee';
  });

  afterEach(() => {
    delete process.env.TELEGRAM_SEND_SCRIPT;
    delete process.env.PRICE_THRESHOLD_CENTS;
    delete process.env.PRODUCT_NAME;
    delete process.env.PRICE_DROP_PCT;
  });

  it('sends Telegram alert when Keepa price is below configured threshold', async () => {
    // $15.00 = 1500 cents < $20.00 = 2000 cents → should alert
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 1500, priceNew: null, priceUsed: null },
    ]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    const [calledScript, calledArgs] = mockSpawnSync.mock.calls[0] as [string, string[]];
    expect(calledScript).toBe('mock-telegram-send.sh');
    const message = calledArgs[0];
    expect(message).toContain('Test Coffee');
    expect(message).toContain('$15.00');
    expect(message).toContain('$20.00');
    expect(message).toContain('25.0%');
    expect(message).toContain(`https://www.amazon.com/dp/${ASIN}`);
  });

  it('does not send Telegram alert when Keepa price is above configured threshold', async () => {
    // $25.00 = 2500 cents > $20.00 = 2000 cents → no alert
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 2500, priceNew: null, priceUsed: null },
    ]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('uses dynamic threshold when PRICE_THRESHOLD_CENTS is not set', async () => {
    delete process.env.PRICE_THRESHOLD_CENTS;
    // Penultimate: $20.00 = 2000 cents. Dynamic threshold = 2000 * 0.9 = $18.00 = 1800 cents.
    // Latest: $15.00 = 1500 cents < 1800 → should alert
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 2000, priceNew: null, priceUsed: null },
      { timestamp: new Date(), priceAmazon: 1500, priceNew: null, priceUsed: null },
    ]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    const message = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][0];
    expect(message).toContain('$15.00');
  });

  it('does not alert when dynamic threshold cannot be determined (single history point)', async () => {
    delete process.env.PRICE_THRESHOLD_CENTS;
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 500, priceNew: null, priceUsed: null },
    ]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('falls back to ASIN as product name when PRODUCT_NAME is not set', async () => {
    delete process.env.PRODUCT_NAME;
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 1500, priceNew: null, priceUsed: null },
    ]);
    await run(ASIN);
    const message = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][0];
    expect(message).toContain(ASIN);
  });

  it('logs to stderr when price alert delivery fails', async () => {
    mockSpawnSync.mockReturnValue({ ...SPAWN_SUCCESS, status: 1 });
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 1500, priceNew: null, priceUsed: null },
    ]);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await run(ASIN);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[price-pulse] price alert delivery failed'),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });
});
