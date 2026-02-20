import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppConfig } from './lib/config.js';
import { errorHandler } from './middleware/error-handler.js';
import { createCommentRoutes } from './routes/comments.routes.js';
import { createGitRoutes } from './routes/git.routes.js';
import { createMcpRoutes } from './routes/mcp.routes.js';
import { createRepoRoutes } from './routes/repos.routes.js';
import { createSessionRoutes } from './routes/sessions.routes.js';
import { createSnapshotRoutes } from './routes/snapshots.routes.js';
import { createSseRoutes } from './routes/sse.routes.js';
import { createTransportRoutes } from './routes/transport.routes.js';
import type { CommentService } from './services/comment.service.js';
import type { DbService } from './services/db.service.js';
import type { GitService } from './services/git.service.js';
import type { RepoService } from './services/repo.service.js';
import type { SessionService } from './services/session.service.js';
import type { SseService } from './services/sse.service.js';
import type { TransportService } from './services/transport.service.js';
import type { WatcherService } from './services/watcher.service.js';

export interface AppDependencies {
    dbService: DbService;
    sseService: SseService;
    watcherService: WatcherService;
    repoService: RepoService;
    sessionService: SessionService;
    commentService: CommentService;
    transportService: TransportService;
    gitService: GitService;
    config: AppConfig;
}

export function createApp(deps: AppDependencies): Hono {
    const app = new Hono();

    // Middleware
    app.use('*', cors());
    app.use('*', logger());

    // Error handler
    app.onError(errorHandler);

    // Health check
    app.get('/api/health', (c) => {
        return c.json({ status: 'ok' });
    });

    // SSE routes
    app.route('/api/sse', createSseRoutes(deps.sseService));

    // API routes
    app.route('/api/mcp', createMcpRoutes(deps.repoService, deps.sessionService, deps.commentService));
    app.route('/api/repos', createRepoRoutes(deps.repoService));
    app.route('/api/sessions', createSessionRoutes(deps.sessionService, deps.watcherService));
    app.route('/api/comments', createCommentRoutes(deps.commentService, deps.transportService));
    app.route('/api/transport', createTransportRoutes(deps.transportService));
    app.route('/api/git', createGitRoutes(deps.gitService, deps.config));

    // Snapshots — mixed mount points (/sessions/:id/snapshots + /snapshots/:id/diff)
    app.route('/api', createSnapshotRoutes(deps.dbService, deps.watcherService, deps.sessionService));

    return app;
}
