import {
    completeSessionSchema,
    createSessionSchema,
    listSessionsQuerySchema,
    updateSessionSchema,
    validation,
} from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { err } from 'neverthrow';
import { asyncResultToResponse, resultToResponse } from '../lib/result-to-response.js';
import type { SessionService } from '../services/session.service.js';
import type { SseService } from '../services/sse.service.js';
import type { WatcherService } from '../services/watcher.service.js';
import { idParamSchema } from './params.js';

export function createSessionRoutes(
    sessionService: SessionService,
    watcherService: WatcherService,
    sseService: SseService,
): Hono {
    const app = new Hono();

    // GET / — List sessions (repo_id + status filters)
    app.get('/', zValidator('query', listSessionsQuerySchema), (c) => {
        const { repo_id, status } = c.req.valid('query');
        return resultToResponse(
            c,
            sessionService.listSessions(repo_id, status ?? 'all').map((sessions) => ({ sessions })),
        );
    });

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
            return resultToResponse(c, err(validation('base_branch is required')));
        }
        return resultToResponse(c, sessionService.updateBaseBranch(id, body.base_branch));
    });

    // POST /:id/complete — Complete session (with optional force)
    app.post(
        '/:id/complete',
        zValidator('param', idParamSchema),
        zValidator('json', completeSessionSchema),
        async (c) => {
            const { id } = c.req.valid('param');
            const { force, reason } = c.req.valid('json');

            const completionResult = sessionService.completeSession(id, { force, reason });
            if (completionResult.isErr()) {
                return resultToResponse(c, completionResult);
            }

            const completion = completionResult.value;
            if (completion.blocked) {
                return c.json(
                    {
                        error: {
                            code: 'SESSION_COMPLETION_BLOCKED',
                            message: 'Session completion blocked by unresolved work',
                        },
                        blockers: completion.summary,
                    },
                    409,
                );
            }

            if (completion.summary.watcher_active) {
                await watcherService.stopWatching(id).match(
                    () => undefined,
                    (error) => {
                        console.warn('[sessions.complete] failed to stop watcher for completed session', {
                            sessionId: id,
                            error,
                        });
                    },
                );
            }

            sseService.broadcast(id, {
                type: 'session-status',
                data: {
                    session_id: id,
                    status: completion.session.status,
                    completed_at: completion.session.completed_at,
                },
            });

            return c.json({
                session: completion.session,
                summary: completion.summary,
                forced: completion.forced,
            });
        },
    );

    // POST /:id/watch — Start file watcher
    app.post('/:id/watch', zValidator('param', idParamSchema), async (c) => {
        const { id } = c.req.valid('param');
        const sessionResult = sessionService.getSession(id);
        if (sessionResult.isErr()) {
            return resultToResponse(c, sessionResult);
        }
        if (sessionResult.value.status === 'completed') {
            return c.json(
                {
                    error: {
                        code: 'SESSION_COMPLETED',
                        message: 'Session is completed and read-only',
                    },
                },
                409,
            );
        }
        const repoPath = sessionResult.value.repo.path;
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
