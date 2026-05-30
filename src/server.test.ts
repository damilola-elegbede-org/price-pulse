import http from 'http';
import { createServer } from './server';
import { upsertAsin } from './db';
import type { Database } from 'better-sqlite3';

jest.mock('./db', () => ({
  upsertAsin: jest.fn(),
}));

const mockUpsertAsin = upsertAsin as jest.MockedFunction<typeof upsertAsin>;

const TEST_TOKEN = 'test-secret-token';

// Includes Authorization header from env when PRICE_PULSE_API_TOKEN is set.
// Pass token=null to omit the header (for auth-failure tests).
function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as { port: number }).port;
    const raw = body !== undefined ? JSON.stringify(body) : '';
    const hdrs: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(raw),
    };
    const t = token === undefined ? process.env.PRICE_PULSE_API_TOKEN : token;
    if (t) hdrs['Authorization'] = `Bearer ${t}`;
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: hdrs },
      res => {
        let buf = '';
        res.on('data', (c: Buffer) => { buf += c.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, data: JSON.parse(buf) }));
      },
    );
    req.on('error', reject);
    req.end(raw);
  });
}

describe('POST /api/v1/price-alerts', () => {
  let server: http.Server;
  const db = {} as Database;

  beforeEach((done: () => void) => {
    jest.clearAllMocks();
    process.env.PRICE_PULSE_API_TOKEN = TEST_TOKEN;
    server = createServer(db);
    server.listen(0, '127.0.0.1', () => done());
  });

  afterEach((done: () => void) => {
    delete process.env.PRICE_PULSE_API_TOKEN;
    server.close(() => done());
  });

  it('returns 200 {ok:true, asin} and calls upsertAsin on valid request', async () => {
    const { status, data } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'B001E4KFG0',
      name: 'Coffee Beans',
      threshold_cents: 2000,
    });
    expect(status).toBe(200);
    expect(data).toEqual({ ok: true, asin: 'B001E4KFG0' });
    expect(mockUpsertAsin).toHaveBeenCalledWith(db, 'B001E4KFG0', 'Coffee Beans', 2000);
  });

  it('returns 400 on missing asin field', async () => {
    const { status, data } = await request(server, 'POST', '/api/v1/price-alerts', {
      name: 'Coffee Beans',
      threshold_cents: 2000,
    });
    expect(status).toBe(400);
    expect((data as { ok: boolean }).ok).toBe(false);
  });

  it('returns 400 on missing name field', async () => {
    const { status, data } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'B001E4KFG0',
      threshold_cents: 2000,
    });
    expect(status).toBe(400);
    expect((data as { ok: boolean }).ok).toBe(false);
  });

  it('returns 400 on missing threshold_cents field', async () => {
    const { status, data } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'B001E4KFG0',
      name: 'Coffee Beans',
    });
    expect(status).toBe(400);
    expect((data as { ok: boolean }).ok).toBe(false);
  });

  it('returns 400 on invalid JSON body', async () => {
    const port = (server.address() as { port: number }).port;
    const { status, data } = await new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method: 'POST', path: '/api/v1/price-alerts',
          headers: { 'Content-Type': 'application/json', 'Content-Length': 7,
                     'Authorization': `Bearer ${TEST_TOKEN}` } },
        res => {
          let buf = '';
          res.on('data', (c: Buffer) => { buf += c.toString(); });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, data: JSON.parse(buf) }));
        },
      );
      req.on('error', reject);
      req.end('{{bad}}');
    });
    expect(status).toBe(400);
    expect((data as { ok: boolean }).ok).toBe(false);
  });

  it('returns 400 when asin format is invalid (not 10-char uppercase alphanumeric)', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: '   ',
      name: 'Coffee Beans',
      threshold_cents: 2000,
    });
    expect(status).toBe(400);
  });

  it('returns 400 when asin is lowercase', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'b001e4kfg0',
      name: 'Coffee Beans',
      threshold_cents: 2000,
    });
    expect(status).toBe(400);
  });

  it('returns 400 when asin is not 10 characters', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'B001',
      name: 'Coffee Beans',
      threshold_cents: 2000,
    });
    expect(status).toBe(400);
  });

  it('returns 400 when name exceeds 512 characters', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'B001E4KFG0',
      name: 'x'.repeat(513),
      threshold_cents: 2000,
    });
    expect(status).toBe(400);
  });

  it('returns 400 when threshold_cents is zero or negative', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: 'B001E4KFG0',
      name: 'Coffee Beans',
      threshold_cents: 0,
    });
    expect(status).toBe(400);
  });

  it('returns 404 for unknown routes', async () => {
    const { status } = await request(server, 'GET', '/unknown', undefined);
    expect(status).toBe(404);
  });
});

describe('POST /api/v1/price-alerts — auth', () => {
  let server: http.Server;
  const db = {} as Database;

  beforeEach((done: () => void) => {
    jest.clearAllMocks();
    process.env.PRICE_PULSE_API_TOKEN = TEST_TOKEN;
    server = createServer(db);
    server.listen(0, '127.0.0.1', () => done());
  });

  afterEach((done: () => void) => {
    delete process.env.PRICE_PULSE_API_TOKEN;
    server.close(() => done());
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { status, data } = await request(server, 'POST', '/api/v1/price-alerts',
      { asin: 'B001E4KFG0', name: 'Coffee', threshold_cents: 2000 },
      null,
    );
    expect(status).toBe(401);
    expect((data as { ok: boolean }).ok).toBe(false);
  });

  it('returns 401 when Authorization header has wrong token', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts',
      { asin: 'B001E4KFG0', name: 'Coffee', threshold_cents: 2000 },
      'wrong-token',
    );
    expect(status).toBe(401);
  });

  it('returns 200 with correct Bearer token', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts',
      { asin: 'B001E4KFG0', name: 'Coffee', threshold_cents: 2000 },
      TEST_TOKEN,
    );
    expect(status).toBe(200);
  });

  it('returns 401 when PRICE_PULSE_API_TOKEN env var is not set', async () => {
    delete process.env.PRICE_PULSE_API_TOKEN;
    const { status } = await request(server, 'POST', '/api/v1/price-alerts',
      { asin: 'B001E4KFG0', name: 'Coffee', threshold_cents: 2000 },
      TEST_TOKEN,
    );
    expect(status).toBe(401);
  });
});
