import { spawnSync } from 'child_process';
import { getProductHistory } from './keepa/client';
import { run } from './pipeline';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('./keepa/client', () => ({ getProductHistory: jest.fn() }));

const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockGetProductHistory = getProductHistory as jest.MockedFunction<typeof getProductHistory>;

const ASIN = 'B001E4KFG0';
const THRESHOLD = 3000;

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
    const result = await run(ASIN, THRESHOLD);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', 'price-pulse: Keepa fetch failed — see pipeline logs'],
      { stdio: 'inherit' },
    );
  });

  it('returns false and sends generic Telegram alert when response has no products', async () => {
    mockGetProductHistory.mockRejectedValue(new Error(`No product found for ASIN: ${ASIN}`));
    const result = await run(ASIN, THRESHOLD);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', 'price-pulse: Keepa fetch failed — see pipeline logs'],
      { stdio: 'inherit' },
    );
  });

  it('returns false and sends generic Telegram alert on invalid JSON response', async () => {
    mockGetProductHistory.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    const result = await run(ASIN, THRESHOLD);
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
    await run(ASIN, THRESHOLD);
    expect(consoleSpy).toHaveBeenCalledWith('[keepa] fetch error:', 'sensitive-api-key=abc123');
    const sentMsg = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sentMsg).not.toContain('sensitive-api-key=abc123');
    consoleSpy.mockRestore();
  });

  it('prefixes the alert with "price-pulse:"', async () => {
    mockGetProductHistory.mockRejectedValue(new Error('HTTP 503'));
    await run(ASIN, THRESHOLD);
    const sentMsg = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sentMsg).toMatch(/^price-pulse:/);
  });

  it('logs to stderr when alert delivery fails', async () => {
    mockSpawnSync.mockReturnValue({ ...SPAWN_SUCCESS, status: 1 });
    mockGetProductHistory.mockRejectedValue(new Error('HTTP 503'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await run(ASIN, THRESHOLD);
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
    await run(ASIN, THRESHOLD);
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('TELEGRAM_SEND_SCRIPT'));
    consoleSpy.mockRestore();
  });

  it('returns an AlertDecision and does not send any alert on successful fetch', async () => {
    mockGetProductHistory.mockResolvedValue([]);
    const result = await run(ASIN, THRESHOLD);
    expect(result).toMatchObject({ should_alert: false, current_price: -1, threshold: THRESHOLD });
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('sends a price-drop Telegram alert when should_alert is true', async () => {
    mockGetProductHistory.mockResolvedValue([
      { timestamp: new Date(), priceAmazon: 1000, priceNew: null, priceUsed: null },
    ]);
    const result = await run(ASIN, THRESHOLD);
    expect(result).not.toBe(false);
    if (result !== false) {
      expect(result.should_alert).toBe(true);
    }
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', expect.stringContaining('price-pulse: price drop')],
      { stdio: 'inherit' },
    );
  });
});
