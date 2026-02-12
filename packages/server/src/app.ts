import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './middleware/error-handler.js';
import { createSseRoutes } from './routes/sse.routes.js';
import type { DbService } from './services/db.service.js';
import type { SseService } from './services/sse.service.js';
import type { WatcherService } from './services/watcher.service.js';

export interface AppDependencies {
    dbService: DbService;
    sseService: SseService;
    watcherService: WatcherService;
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

    return app;
}
