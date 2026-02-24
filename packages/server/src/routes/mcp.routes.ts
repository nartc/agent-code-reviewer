import type { RepoPath, RepoWithPaths } from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { resultToResponse } from '../lib/result-to-response.js';
import type { CommentService } from '../services/comment.service.js';
import type { RepoService } from '../services/repo.service.js';
import type { SessionService } from '../services/session.service.js';
import { idParamSchema } from './params.js';

const mcpCommentsQuerySchema = z.object({
    repo_path: z.string().optional(),
    repo_name: z.string().optional(),
    snapshot_id: z.string().optional(),
});

const replyBodySchema = z.object({ content: z.string() });

export function createMcpRoutes(
    repoService: RepoService,
    sessionService: SessionService,
    commentService: CommentService,
): Hono {
    const app = new Hono();

    // GET /comments?repo_path=X&repo_name=Y&snapshot_id=Z
    app.get('/comments', zValidator('query', mcpCommentsQuerySchema), (c) => {
        const { repo_path, repo_name, snapshot_id } = c.req.valid('query');

        if (!repo_path && !repo_name) {
            return c.json(
                { error: { code: 'VALIDATION_ERROR', message: 'At least one of repo_path or repo_name is required' } },
                400,
            );
        }

        const reposResult = repoService.listRepos();
        if (reposResult.isErr()) return resultToResponse(c, reposResult);

        const repos = reposResult.value;
        let foundRepo = repo_path ? repos.find((r: RepoWithPaths) => r.paths.some((p: RepoPath) => p.path === repo_path)) : undefined;
        if (!foundRepo && repo_name) {
            foundRepo = repos.find((r: RepoWithPaths) => r.name === repo_name);
        }

        if (!foundRepo) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Repo not found' } }, 404);
        }

        const sessionsResult = sessionService.listSessions(foundRepo.id);
        if (sessionsResult.isErr()) return resultToResponse(c, sessionsResult);

        const sessions = sessionsResult.value;
        if (sessions.length === 0) {
            return c.json({ threads: [], repo_name: foundRepo.name });
        }

        const latestSession = sessions[0];

        const commentsResult = commentService.getCommentsByStatus(latestSession.id, 'sent');
        if (commentsResult.isErr()) return resultToResponse(c, commentsResult);

        const parentComments = commentsResult.value.filter(
            (comment) =>
                comment.resolved_at === null &&
                comment.reply_to_id === null &&
                (!snapshot_id || comment.snapshot_id === snapshot_id),
        );

        const threads = [];
        for (const parent of parentComments) {
            const threadResult = commentService.getCommentThread(parent.id);
            if (threadResult.isErr()) return resultToResponse(c, threadResult);
            if (threadResult.value) {
                threads.push(threadResult.value);
            }
        }

        return c.json({ threads, repo_name: foundRepo.name });
    });

    // GET /comments/:id
    app.get('/comments/:id', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        const result = commentService.getCommentThread(id);
        if (result.isErr()) return resultToResponse(c, result);
        if (!result.value) {
            return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
        }
        return c.json({ thread: result.value });
    });

    // POST /comments/:id/reply
    app.post('/comments/:id/reply', zValidator('param', idParamSchema), zValidator('json', replyBodySchema), (c) => {
        const { id } = c.req.valid('param');
        const { content } = c.req.valid('json');
        return resultToResponse(c, commentService.createReply(id, content, 'agent'), 201);
    });

    // POST /comments/:id/resolve
    app.post('/comments/:id/resolve', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        return resultToResponse(c, commentService.resolve(id));
    });

    return app;
}
