import type { Comment, CommentPayload, CommentStatus } from '@agent-code-reviewer/shared';
import {
    createCommentSchema,
    listCommentsQuerySchema,
    replyToCommentSchema,
    sendCommentsSchema,
    updateCommentSchema,
} from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { resultToResponse } from '../lib/result-to-response.js';
import type { CommentService } from '../services/comment.service.js';
import type { TransportService } from '../services/transport.service.js';
import { idParamSchema } from './params.js';

function buildPayload(comment: Comment): CommentPayload {
    return {
        file_path: comment.file_path,
        line_start: comment.line_start,
        line_end: comment.line_end,
        side: comment.side,
        content: comment.content,
        status: comment.status,
        author: comment.author,
    };
}

export function createCommentRoutes(commentService: CommentService, transportService: TransportService): Hono {
    const app = new Hono();

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
        return resultToResponse(c, commentService.create(input), 201);
    });

    // POST /send — Mark sent + deliver (MUST be before /:id routes)
    app.post('/send', zValidator('json', sendCommentsSchema), async (c) => {
        const { comment_ids, target_id, transport_type } = c.req.valid('json');
        const markResult = commentService.markSent(comment_ids);
        if (markResult.isErr()) {
            return resultToResponse(c, markResult);
        }
        const sentComments = markResult.value;
        const payloads: CommentPayload[] = sentComments.map(buildPayload);
        const sendResult = await transportService.send(transport_type, target_id, payloads);
        if (sendResult.isErr()) {
            return resultToResponse(c, sendResult);
        }
        return c.json({
            comments: sentComments,
            formatted_text: sendResult.value.formatted_text,
        });
    });

    // PATCH /:id — Update content
    app.patch('/:id', zValidator('param', idParamSchema), zValidator('json', updateCommentSchema), (c) => {
        const { id } = c.req.valid('param');
        const { content } = c.req.valid('json');
        return resultToResponse(c, commentService.update(id, content));
    });

    // DELETE /:id — Delete draft
    app.delete('/:id', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        const result = commentService.delete(id);
        if (result.isErr()) {
            return resultToResponse(c, result);
        }
        return c.body(null, 204);
    });

    // POST /:id/resolve — Resolve comment
    app.post('/:id/resolve', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        return resultToResponse(c, commentService.resolve(id));
    });

    // POST /:id/reply — Create threaded reply
    app.post('/:id/reply', zValidator('param', idParamSchema), zValidator('json', replyToCommentSchema), (c) => {
        const { id } = c.req.valid('param');
        const { content } = c.req.valid('json');
        return resultToResponse(c, commentService.createReply(id, content, 'user'), 201);
    });

    return app;
}
