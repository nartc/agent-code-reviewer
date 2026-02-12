import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { DbService } from './services/db.service.js';
import { errorHandler } from './middleware/error-handler.js';

export interface AppDependencies {
  dbService: DbService;
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

  // Routes will be mounted here in Phase 7
  // app.route('/api/repos', repoRoutes);
  // app.route('/api/sessions', sessionRoutes);
  // etc.

  return app;
}
