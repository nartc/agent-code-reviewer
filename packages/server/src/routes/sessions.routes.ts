import { createSessionSchema, updateSessionSchema } from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { asyncResultToResponse, resultToResponse } from '../lib/result-to-response.js';
import type { SessionService } from '../services/session.service.js';
import type { WatcherService } from '../services/watcher.service.js';
import { idParamSchema } from './params.js';

export function createSessionRoutes(sessionService: SessionService, watcherService: WatcherService): Hono {
    const app = new Hono();

    // GET /:id — Get session with repo
    app.get('/:id', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        return resultToResponse(c, sessionService.getSession(id));
    });

    // POST / — Create session + capture initial snapshot
    app.post('/', zValidator('json', createSessionSchema), (c) => {
        const { repo_id, path } = c.req.valid('json');
        const pipeline = sessionService
            .getOrCreateSession(repo_id, path)
            .andThen((session) =>
                watcherService.captureSnapshot(session.id, path, 'initial').map((snapshot) => ({ session, snapshot })),
            );
        return asyncResultToResponse(c, pipeline, 201);
    });

    // PATCH /:id — Update base branch
    app.patch('/:id', zValidator('param', idParamSchema), zValidator('json', updateSessionSchema), (c) => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');
        if (!body.base_branch) {
            return c.json({ error: { code: 'VALIDATION', message: 'base_branch is required' } }, 400);
        }
        return resultToResponse(c, sessionService.updateBaseBranch(id, body.base_branch));
    });

    // POST /:id/watch — Start file watcher
    app.post('/:id/watch', zValidator('param', idParamSchema), async (c) => {
        const { id } = c.req.valid('param');
        const sessionResult = sessionService.getSession(id);
        if (sessionResult.isErr()) {
            return resultToResponse(c, sessionResult);
        }
        const repoPath = sessionResult.value.repo_path.path;
        return asyncResultToResponse(
            c,
            watcherService.startWatching(id, repoPath).map(() => ({ message: 'Watching started' })),
        );
    });

    // DELETE /:id/watch — Stop file watcher
    app.delete('/:id/watch', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        return asyncResultToResponse(
            c,
            watcherService.stopWatching(id).map(() => ({ message: 'Watching stopped' })),
        );
    });

    return app;
}
