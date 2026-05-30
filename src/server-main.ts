import { openDb } from './db';
import { createServer } from './server';

if (!process.env.PRICE_PULSE_API_TOKEN) {
  console.error('PRICE_PULSE_API_TOKEN environment variable is required');
  process.exit(1);
}
if (!process.env.DB_PATH) {
  console.error('DB_PATH environment variable is required');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? '4100', 10);
const db = openDb(process.env.DB_PATH);
const server = createServer(db);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[price-pulse] HTTP server listening on 127.0.0.1:${PORT}`);
});
