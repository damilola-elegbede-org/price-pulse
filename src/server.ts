import http from 'http';
import type { Database } from 'better-sqlite3';
import { upsertAsin } from './db';

const MAX_BODY_BYTES = 65_536;
const ASIN_RE = /^[A-Z0-9]{10}$/;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        req.destroy(new Error('request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function createServer(db: Database): http.Server {
  return http.createServer(async (req, res) => {
    const requiredToken = process.env.PRICE_PULSE_API_TOKEN;
    if (requiredToken) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${requiredToken}`) {
        send(res, 401, { ok: false, error: 'unauthorized' });
        return;
      }
    }

    if (req.method === 'POST' && req.url === '/api/v1/price-alerts') {
      let parsed: unknown;
      try {
        const raw = await readBody(req);
        parsed = JSON.parse(raw);
      } catch {
        send(res, 400, { ok: false, error: 'invalid JSON' });
        return;
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>)['asin'] !== 'string' ||
        typeof (parsed as Record<string, unknown>)['name'] !== 'string' ||
        typeof (parsed as Record<string, unknown>)['threshold_cents'] !== 'number'
      ) {
        send(res, 400, { ok: false, error: 'asin, name, threshold_cents are required' });
        return;
      }

      const { asin, name, threshold_cents } = parsed as { asin: string; name: string; threshold_cents: number };

      if (!ASIN_RE.test(asin)) {
        send(res, 400, { ok: false, error: 'asin must be 10-char uppercase alphanumeric' });
        return;
      }
      if (name.length > 512) {
        send(res, 400, { ok: false, error: 'name must not exceed 512 characters' });
        return;
      }
      if (threshold_cents <= 0) {
        send(res, 400, { ok: false, error: 'threshold_cents must be positive' });
        return;
      }

      upsertAsin(db, asin, name, threshold_cents);
      send(res, 200, { ok: true, asin });
      return;
    }

    send(res, 404, { ok: false, error: 'not found' });
  });
}
