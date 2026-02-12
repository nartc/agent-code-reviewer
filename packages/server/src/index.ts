import { serve } from '@hono/node-server';
import { loadConfig } from './lib/config.js';
import { initDatabase } from './db/client.js';
import { DbService } from './services/db.service.js';
import { createApp } from './app.js';

async function main() {
  const config = loadConfig();

  console.log(`[server] Initializing database at ${config.dbPath}`);
  const dbResult = await initDatabase(config.dbPath);

  if (dbResult.isErr()) {
    console.error('[server] Failed to initialize database:', dbResult.error);
    process.exit(1);
  }

  const db = dbResult.value;
  const dbService = new DbService(db, config.dbPath);

  const app = createApp({ dbService });

  serve(
    { fetch: app.fetch, port: config.port },
    (info) => {
      console.log(`[server] Listening on http://localhost:${info.port}`);
    }
  );
}

main().catch((e) => {
  console.error('[server] Fatal error:', e);
  process.exit(1);
});
