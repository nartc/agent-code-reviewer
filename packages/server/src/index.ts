import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { initDatabase } from './db/client.js';
import { loadConfig } from './lib/config.js';
import { DbService } from './services/db.service.js';
import { GitService } from './services/git.service.js';
import { SessionService } from './services/session.service.js';
import { SseService } from './services/sse.service.js';
import { WatcherService } from './services/watcher.service.js';

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
    const sseService = new SseService();
    const gitService = new GitService();
    const sessionService = new SessionService(dbService, gitService);
    const watcherService = new WatcherService(dbService, gitService, sessionService, sseService);

    const app = createApp({ dbService, sseService, watcherService });

    const shutdown = async () => {
        console.log('[server] Shutting down...');
        await watcherService.stopAll();
        sseService.shutdown();
        dbService.save();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    serve({ fetch: app.fetch, port: config.port }, (info) => {
        console.log(`[server] Listening on http://localhost:${info.port}`);
    });
}

main().catch((e) => {
    console.error('[server] Fatal error:', e);
    process.exit(1);
});
