import { spawnSync } from 'child_process';
import { getProductHistory } from './keepa/client';
import { run } from './pipeline';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('./keepa/client', () => ({ getProductHistory: jest.fn() }));

const mockSpawnSync = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockGetProductHistory = getProductHistory as jest.MockedFunction<typeof getProductHistory>;

const ASIN = 'B001E4KFG0';

describe('pipeline.run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns false and sends Telegram alert on non-2xx HTTP error', async () => {
    mockGetProductHistory.mockRejectedValue(new Error('Keepa API error: HTTP 429'));
    const result = await run(ASIN);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', expect.stringContaining('Keepa API error: HTTP 429')],
      { stdio: 'inherit' },
    );
  });

  it('returns false and sends Telegram alert when response has no products', async () => {
    mockGetProductHistory.mockRejectedValue(new Error(`No product found for ASIN: ${ASIN}`));
    const result = await run(ASIN);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', expect.stringContaining('No product found for ASIN')],
      { stdio: 'inherit' },
    );
  });

  it('returns false and sends Telegram alert on invalid JSON response', async () => {
    mockGetProductHistory.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    const result = await run(ASIN);
    expect(result).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      expect.any(String),
      ['--raw', expect.stringContaining('Unexpected token')],
      { stdio: 'inherit' },
    );
  });

  it('truncates alert message to 120 chars when error detail is very long', async () => {
    mockGetProductHistory.mockRejectedValue(new Error('x'.repeat(200)));
    await run(ASIN);
    const sentMsg = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sentMsg.length).toBeLessThanOrEqual(120);
  });

  it('prefixes the alert with "price-pulse:"', async () => {
    mockGetProductHistory.mockRejectedValue(new Error('HTTP 503'));
    await run(ASIN);
    const sentMsg = (mockSpawnSync.mock.calls[0] as [string, string[]])[1][1];
    expect(sentMsg).toMatch(/^price-pulse:/);
  });

  it('returns true and does not send any alert on successful fetch', async () => {
    mockGetProductHistory.mockResolvedValue([]);
    const result = await run(ASIN);
    expect(result).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
