import http from 'http';
import { createServer } from './server';
import { upsertAsin } from './db';
import { openDb } from './db';
import type { Database } from 'better-sqlite3';

jest.mock('./db', () => ({
  upsertAsin: jest.fn(),
}));

const mockUpsertAsin = upsertAsin as jest.MockedFunction<typeof upsertAsin>;

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as { port: number }).port;
    const raw = body !== undefined ? JSON.stringify(body) : '';
    const req = http.request(
      { host: '127.0.0.1', port, method, path,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } },
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
    server = createServer(db);
    server.listen(0, '127.0.0.1', () => done());
  });

  afterEach((done: () => void) => { server.close(() => done()); });

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
          headers: { 'Content-Type': 'application/json', 'Content-Length': 7 } },
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

  it('returns 400 when asin is empty string', async () => {
    const { status } = await request(server, 'POST', '/api/v1/price-alerts', {
      asin: '   ',
      name: 'Coffee Beans',
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
