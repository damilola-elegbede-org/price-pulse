import { spawnSync } from 'child_process';
import { getProductHistory } from './keepa/client';
import { run, runAll, sendAlert } from './pipeline';
import type { Database } from 'better-sqlite3';
import {
  insertPricePoint,
  get7dAvgCents,
  wasAlertedRecently,
  recordAlert,
  listAsins,
} from './db';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('./keepa/client', () => ({ getProductHistory: jest.fn() }));
jest.mock('./db', () => ({
  insertPricePoint: jest.fn(),
  get7dAvgCents: jest.fn(),
  wasAlertedRecently: jest.fn(),
  recordAlert: jest.fn(),
  listAsins: jest.fn(),
}));

const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockGetProductHistory = getProductHistory as jest.MockedFunction<typeof getProductHistory>;
const mockInsertPricePoint = insertPricePoint as jest.MockedFunction<typeof insertPricePoint>;
const mockGet7dAvgCents = get7dAvgCents as jest.MockedFunction<typeof get7dAvgCents>;
const mockWasAlertedRecently = wasAlertedRecently as jest.MockedFunction<typeof wasAlertedRecently>;
const mockRecordAlert = recordAlert as jest.MockedFunction<typeof recordAlert>;
const mockListAsins = listAsins as jest.MockedFunction<typeof listAsins>;

const ASIN = 'B001E4KFG0';
const MOCK_DB = {} as Database;

const SPAWN_SUCCESS = {
  status: 0,
  error: undefined,
  output: [],
  pid: 0,
  signal: null,
  stderr: Buffer.alloc(0),
  stdout: Buffer.alloc(0),
} as ReturnType<typeof spawnSync>;

const PRICE_POINT = {
  timestamp: new Date(),
  priceAmazon: 1800,
  priceNew: null,
  priceUsed: null,
};

describe('pipeline.run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSync.mockReturnValue(SPAWN_SUCCESS);
    mockWasAlertedRecently.mockReturnValue(false);
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

  it('returns true and does not send any alert on successful fetch without db', async () => {
    mockGetProductHistory.mockResolvedValue([]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  // ── DB + alert-decision integration ─────────────────────────────────────────

  it('inserts price point and fires alert when price is below configured threshold', async () => {
    const lowerPoint = { ...PRICE_POINT, priceAmazon: 1799 }; // $17.99 < $19.00 threshold
    mockGetProductHistory.mockResolvedValue([lowerPoint]);
    mockGet7dAvgCents.mockReturnValue(2000); // $20.00 avg (display only)

    const result = await run(ASIN, MOCK_DB, 1900);
    expect(result).toBe(true);
    expect(mockInsertPricePoint).toHaveBeenCalledWith(MOCK_DB, ASIN, 1799, null, null);
    expect(mockSpawnSync).toHaveBeenCalled();
    expect(mockRecordAlert).toHaveBeenCalledWith(MOCK_DB, ASIN, 1799);
  });

  it('does not send alert when price is above configured threshold', async () => {
    const highPoint = { ...PRICE_POINT, priceAmazon: 1950 }; // $19.50 > $18.00 threshold
    mockGetProductHistory.mockResolvedValue([highPoint]);
    mockGet7dAvgCents.mockReturnValue(2000);

    await run(ASIN, MOCK_DB, 1800);
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(mockRecordAlert).not.toHaveBeenCalled();
  });

  it('skips alert (dedup) when alerted within last 24h', async () => {
    const lowerPoint = { ...PRICE_POINT, priceAmazon: 1500 };
    mockGetProductHistory.mockResolvedValue([lowerPoint]);
    mockGet7dAvgCents.mockReturnValue(2000);
    mockWasAlertedRecently.mockReturnValue(true);

    await run(ASIN, MOCK_DB, 2000);
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(mockRecordAlert).not.toHaveBeenCalled();
  });

  it('computes 7d average before inserting price point (historical baseline)', async () => {
    const callOrder: string[] = [];
    mockGet7dAvgCents.mockImplementation(() => { callOrder.push('get7dAvg'); return null; });
    mockInsertPricePoint.mockImplementation(() => { callOrder.push('insert'); });
    mockGetProductHistory.mockResolvedValue([PRICE_POINT]);
    mockWasAlertedRecently.mockReturnValue(true); // suppress alert path

    await run(ASIN, MOCK_DB, 2000);
    expect(callOrder).toEqual(['get7dAvg', 'insert']);
  });

  it('does not insert price point when history is empty', async () => {
    mockGetProductHistory.mockResolvedValue([]);
    await run(ASIN, MOCK_DB, 2000);
    expect(mockInsertPricePoint).not.toHaveBeenCalled();
  });
});

describe('pipeline.runAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSync.mockReturnValue(SPAWN_SUCCESS);
    process.env.TELEGRAM_SEND_SCRIPT = 'mock-telegram-send.sh';
  });

  afterEach(() => {
    delete process.env.TELEGRAM_SEND_SCRIPT;
  });

  it('polls all tracked ASINs and returns true when all succeed', async () => {
    mockListAsins.mockReturnValue([
      { asin: 'B001', name: 'Item A', threshold_cents: 2000 },
      { asin: 'B002', name: 'Item B', threshold_cents: 3000 },
    ]);
    mockGetProductHistory.mockResolvedValue([]);

    const ok = await runAll(MOCK_DB);
    expect(ok).toBe(true);
    expect(mockGetProductHistory).toHaveBeenCalledTimes(2);
  });

  it('returns false when at least one ASIN poll fails', async () => {
    mockListAsins.mockReturnValue([
      { asin: 'B001', name: 'Item A', threshold_cents: 2000 },
      { asin: 'B002', name: 'Item B', threshold_cents: 3000 },
    ]);
    mockGetProductHistory
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Keepa 429'));

    const ok = await runAll(MOCK_DB);
    expect(ok).toBe(false);
  });

  it('logs and returns true when no ASINs are tracked', async () => {
    mockListAsins.mockReturnValue([]);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const ok = await runAll(MOCK_DB);
    expect(ok).toBe(true);
    expect(mockGetProductHistory).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('sendAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawnSync.mockReturnValue(SPAWN_SUCCESS);
  });

  it('truncates messages longer than 120 chars', () => {
    process.env.TELEGRAM_SEND_SCRIPT = 'send.sh';
    const long = 'x'.repeat(200);
    sendAlert(long);
    const sent = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sent.length).toBe(120);
    delete process.env.TELEGRAM_SEND_SCRIPT;
  });
});
