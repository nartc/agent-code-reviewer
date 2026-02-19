import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { initDatabase } from './db/client.js';
import { loadConfig } from './lib/config.js';
import { CommentService } from './services/comment.service.js';
import { DbService } from './services/db.service.js';
import { GitService } from './services/git.service.js';
import { RepoService } from './services/repo.service.js';
import { SessionService } from './services/session.service.js';
import { SseService } from './services/sse.service.js';
import { TransportService } from './services/transport.service.js';
import { AgentPollService } from './services/agent-poll.service.js';
import { WatcherService } from './services/watcher.service.js';
import { ClipboardTransport } from './transport/clipboard.transport.js';
import { TmuxTransport } from './transport/tmux.transport.js';

async function main() {
    const config = loadConfig();

    console.log(`[server] Initializing database at ${config.dbPath}`);
    const dbResult = await initDatabase(config.dbPath);

    if (dbResult.isErr()) {
        console.error('[server] Failed to initialize database:', dbResult.error);
        process.exit(1);
    }

    const db = dbResult.value;

    // Infrastructure
    const dbService = new DbService(db, config.dbPath);
    const sseService = new SseService();
    const gitService = new GitService();

    // Domain services
    const repoService = new RepoService(dbService, gitService);
    const sessionService = new SessionService(dbService, gitService);
    const commentService = new CommentService(dbService, sseService);
    const watcherService = new WatcherService(dbService, gitService, sessionService, sseService);

    // Transport
    const tmuxTransport = new TmuxTransport();
    const clipboardTransport = new ClipboardTransport();
    const transportService = new TransportService([tmuxTransport, clipboardTransport], dbService);

    // Agent reply polling
    const agentPollIntervalMs = parseInt(process.env['ACR_AGENT_POLL_INTERVAL_MS'] ?? '5000', 10);
    const agentPollService = new AgentPollService(dbService, sseService, agentPollIntervalMs);
    agentPollService.start();

    const app = createApp({
        dbService,
        sseService,
        watcherService,
        repoService,
        sessionService,
        commentService,
        transportService,
        gitService,
        config,
    });

    const shutdown = async () => {
        console.log('[server] Shutting down...');
        agentPollService.stop();
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
