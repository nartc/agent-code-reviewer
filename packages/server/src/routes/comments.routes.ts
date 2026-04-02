import type { Comment, CommentPayload, CommentStatus } from '@agent-code-reviewer/shared';
import {
    createCommentSchema,
    listCommentsQuerySchema,
    notFound,
    replyToCommentSchema,
    sendCommentsSchema,
    updateCommentSchema,
    validation,
} from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { err } from 'neverthrow';
import { resultToResponse } from '../lib/result-to-response.js';
import type { CommentService } from '../services/comment.service.js';
import type { SessionService } from '../services/session.service.js';
import type { TransportService } from '../services/transport.service.js';
import { idParamSchema } from './params.js';

function buildPayload(comment: Comment, replies: Comment[] = []): CommentPayload {
    return {
        id: comment.id,
        file_path: comment.file_path,
        line_start: comment.line_start,
        line_end: comment.line_end,
        side: comment.side,
        content: comment.content,
        status: comment.status,
        author: comment.author,
        thread_replies: replies.map((r) => ({ id: r.id, content: r.content, author: r.author })),
    };
}

function completedSessionResponse(c: Context): Response {
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

export function createCommentRoutes(
    commentService: CommentService,
    transportService: TransportService,
    sessionService: SessionService,
): Hono {
    const app = new Hono();

    const ensureSessionWritable = (c: any, sessionId: string): Response | null => {
        const sessionResult = sessionService.getSession(sessionId);
        if (sessionResult.isErr()) return resultToResponse(c, sessionResult);
        if (sessionResult.value.status === 'completed') return completedSessionResponse(c);
        return null;
    };

    // GET / — Query comments (flexible)
    app.get('/', zValidator('query', listCommentsQuerySchema), (c) => {
        const { session_id, snapshot_id, status } = c.req.valid('query');

        if (snapshot_id) {
            return resultToResponse(
                c,
                commentService.getCommentsForSnapshot(session_id, snapshot_id).map((comments) => ({ comments })),
            );
        }

        if (status) {
            return resultToResponse(
                c,
                commentService.getCommentsByStatus(session_id, status as CommentStatus).map((comments) => ({
                    comments: comments.map((comment) => ({ comment, replies: [] })),
                })),
            );
        }

        return resultToResponse(
            c,
            commentService.getSessionComments(session_id).map((comments) => ({ comments })),
        );
    });

    // POST / — Create comment
    app.post('/', zValidator('json', createCommentSchema), (c) => {
        const input = c.req.valid('json');
        const guard = ensureSessionWritable(c, input.session_id);
        if (guard) return guard;
        return resultToResponse(c, commentService.create(input), 201);
    });

    // POST /send — Mark sent + deliver (MUST be before /:id routes)
    app.post('/send', zValidator('json', sendCommentsSchema), async (c) => {
        const { comment_ids, target_id, transport_type, snapshot_id } = c.req.valid('json');

        const sessionIds = new Set<string>();
        for (const commentId of comment_ids) {
            const commentResult = commentService.getCommentById(commentId);
            if (commentResult.isErr()) return resultToResponse(c, commentResult);
            if (!commentResult.value) return resultToResponse(c, err(notFound('Comment not found')));
            sessionIds.add(commentResult.value.session_id);
        }

        if (sessionIds.size > 1) {
            return resultToResponse(c, err(validation('All comments in a send request must belong to one session')));
        }

        const sessionId = [...sessionIds][0];
        const guard = ensureSessionWritable(c, sessionId);
        if (guard) return guard;

        const markResult = commentService.markSent(comment_ids);
        if (markResult.isErr()) {
            return resultToResponse(c, markResult);
        }
        const sentComments = markResult.value;
        const replyMap: Record<string, Comment[]> = {};
        const parentIds = new Set<string>();
        for (const c of sentComments) {
            if (c.reply_to_id) {
                (replyMap[c.reply_to_id] ??= []).push(c);
                parentIds.add(c.reply_to_id);
            }
        }
        // Include parents that were already sent (not in sentComments) but have new draft replies
        const parents = sentComments.filter((c) => c.reply_to_id === null);
        const existingParentIds = new Set(parents.map((c) => c.id));
        for (const pid of parentIds) {
            if (!existingParentIds.has(pid)) {
                const parentResult = commentService.getCommentById(pid);
                if (parentResult.isOk() && parentResult.value) {
                    parents.push(parentResult.value);
                }
            }
        }
        const payloads: CommentPayload[] = parents.map((c) => buildPayload(c, replyMap[c.id] ?? []));
        const sendResult = await transportService.send(transport_type, target_id, payloads, { snapshot_id });
        if (sendResult.isErr()) {
            return resultToResponse(c, sendResult);
        }
        return c.json({
            comments: sentComments,
            formatted_text: sendResult.value.formatted_text,
        });
    });

    // POST /bulk-resolve — Resolve multiple comments at once
    app.post('/bulk-resolve', async (c) => {
        const body = await c.req.json<{ session_id: string; snapshot_id?: string; comment_ids?: string[] }>();
        if (!body.session_id) {
            return c.json({ error: 'session_id is required' }, 400);
        }

        const guard = ensureSessionWritable(c, body.session_id);
        if (guard) return guard;

        const result = commentService.bulkResolve(body.session_id, body.snapshot_id, body.comment_ids);
        if (result.isErr()) {
            return resultToResponse(c, result);
        }
        return c.json({ resolved_count: result.value });
    });

    // PATCH /:id — Update content
    app.patch('/:id', zValidator('param', idParamSchema), zValidator('json', updateCommentSchema), (c) => {
        const { id } = c.req.valid('param');
        const { content } = c.req.valid('json');

        const existing = commentService.getCommentById(id);
        if (existing.isErr()) return resultToResponse(c, existing);
        if (!existing.value) return resultToResponse(c, err(notFound('Comment not found')));

        const guard = ensureSessionWritable(c, existing.value.session_id);
        if (guard) return guard;

        return resultToResponse(c, commentService.update(id, content));
    });

    // DELETE /:id — Delete draft
    app.delete('/:id', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');

        const existing = commentService.getCommentById(id);
        if (existing.isErr()) return resultToResponse(c, existing);
        if (!existing.value) return resultToResponse(c, err(notFound('Comment not found')));

        const guard = ensureSessionWritable(c, existing.value.session_id);
        if (guard) return guard;

        const result = commentService.delete(id);
        if (result.isErr()) {
            return resultToResponse(c, result);
        }
        return c.body(null, 204);
    });

    // POST /:id/resolve — Resolve comment
    app.post('/:id/resolve', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');

        const existing = commentService.getCommentById(id);
        if (existing.isErr()) return resultToResponse(c, existing);
        if (!existing.value) return resultToResponse(c, err(notFound('Comment not found')));

        const guard = ensureSessionWritable(c, existing.value.session_id);
        if (guard) return guard;

        return resultToResponse(c, commentService.resolve(id));
    });

    // POST /:id/reply — Create threaded reply
    app.post('/:id/reply', zValidator('param', idParamSchema), zValidator('json', replyToCommentSchema), (c) => {
        const { id } = c.req.valid('param');
        const { content } = c.req.valid('json');

        const existing = commentService.getCommentById(id);
        if (existing.isErr()) return resultToResponse(c, existing);
        if (!existing.value) return resultToResponse(c, err(notFound('Parent comment not found')));

        const guard = ensureSessionWritable(c, existing.value.session_id);
        if (guard) return guard;

        return resultToResponse(c, commentService.createReply(id, content, 'user', 'draft'), 201);
    });

    return app;
}
