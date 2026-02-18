import {
    type Comment,
    type CommentAuthor,
    type CommentSide,
    type CommentStatus,
    type CommentThread,
    type CreateCommentInput,
    type DatabaseError,
    type FileSummary,
    type NotFoundError,
    type ValidationError,
    databaseError,
    generateId,
    notFound,
    validation,
} from '@agent-code-reviewer/shared';
import { type Result, err, ok } from 'neverthrow';
import type { DbService } from './db.service.js';
import type { SseService } from './sse.service.js';

interface CommentRow {
    id: string;
    session_id: string;
    snapshot_id: string;
    reply_to_id: string | null;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    side: string | null;
    author: string;
    content: string;
    status: string;
    created_at: string;
    sent_at: string | null;
    resolved_at: string | null;
}

function castComment(row: CommentRow): Comment {
    return {
        id: row.id,
        session_id: row.session_id,
        snapshot_id: row.snapshot_id,
        reply_to_id: row.reply_to_id,
        file_path: row.file_path,
        line_start: row.line_start,
        line_end: row.line_end,
        side: row.side as CommentSide | null,
        author: row.author as CommentAuthor,
        content: row.content,
        status: row.status as CommentStatus,
        created_at: row.created_at,
        sent_at: row.sent_at,
        resolved_at: row.resolved_at,
    };
}

export class CommentService {
    constructor(
        private db: DbService,
        private sse: SseService,
    ) {}

    create(input: CreateCommentInput): Result<Comment, DatabaseError | ValidationError | NotFoundError> {
        if (!input.content.trim()) {
            return err(validation('Content must not be empty'));
        }

        if (!input.file_path.trim()) {
            return err(validation('File path must not be empty'));
        }

        const snapshotResult = this.db.queryOne<{ id: string }>('SELECT id FROM snapshots WHERE id = $id', {
            $id: input.snapshot_id,
        });
        if (snapshotResult.isErr()) return err(snapshotResult.error);
        if (!snapshotResult.value) return err(notFound('Snapshot not found'));

        const id = generateId();

        const insertResult = this.db.execute(
            `INSERT INTO comments (id, session_id, snapshot_id, reply_to_id, file_path, line_start, line_end, side, author, content, status)
             VALUES ($id, $sessionId, $snapshotId, $replyToId, $filePath, $lineStart, $lineEnd, $side, $author, $content, 'draft')`,
            {
                $id: id,
                $sessionId: input.session_id,
                $snapshotId: input.snapshot_id,
                $replyToId: input.reply_to_id ?? null,
                $filePath: input.file_path,
                $lineStart: input.line_start ?? null,
                $lineEnd: input.line_end ?? null,
                $side: input.side ?? null,
                $author: input.author ?? 'user',
                $content: input.content,
            },
        );
        if (insertResult.isErr()) return err(insertResult.error);

        const readResult = this.db.queryOne<CommentRow>('SELECT * FROM comments WHERE id = $id', { $id: id });
        if (readResult.isErr()) return err(readResult.error);
        if (!readResult.value) return err(notFound('Comment not found after creation'));

        const comment = castComment(readResult.value);

        this.sse.broadcast(input.session_id, {
            type: 'comment-update',
            data: { session_id: input.session_id, comment_id: id, action: 'created' },
        });

        return ok(comment);
    }

    update(id: string, content: string): Result<Comment, DatabaseError | NotFoundError | ValidationError> {
        const existing = this.getCommentById(id);
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Comment not found'));

        const comment = existing.value;
        if (comment.status !== 'draft') {
            return err(validation('Only draft comments can be edited'));
        }

        if (!content.trim()) {
            return err(validation('Content must not be empty'));
        }

        const updateResult = this.db.execute('UPDATE comments SET content = $content WHERE id = $id', {
            $content: content,
            $id: id,
        });
        if (updateResult.isErr()) return err(updateResult.error);

        const readResult = this.db.queryOne<CommentRow>('SELECT * FROM comments WHERE id = $id', { $id: id });
        if (readResult.isErr()) return err(readResult.error);
        if (!readResult.value) return err(notFound('Comment not found after update'));

        const updated = castComment(readResult.value);

        this.sse.broadcast(updated.session_id, {
            type: 'comment-update',
            data: { session_id: updated.session_id, comment_id: id, action: 'updated' },
        });

        return ok(updated);
    }

    delete(id: string): Result<void, DatabaseError | NotFoundError | ValidationError> {
        const existing = this.getCommentById(id);
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Comment not found'));

        const comment = existing.value;
        if (comment.status !== 'draft') {
            return err(validation('Only draft comments can be deleted'));
        }

        const deleteResult = this.db.execute('DELETE FROM comments WHERE id = $id', { $id: id });
        if (deleteResult.isErr()) return err(deleteResult.error);

        this.sse.broadcast(comment.session_id, {
            type: 'comment-update',
            data: { session_id: comment.session_id, comment_id: id, action: 'deleted' },
        });

        return ok(undefined);
    }

    getCommentsByStatus(sessionId: string, status: CommentStatus): Result<Comment[], DatabaseError> {
        const result = this.db.query<CommentRow>(
            'SELECT * FROM comments WHERE session_id = $sessionId AND status = $status',
            { $sessionId: sessionId, $status: status },
        );
        if (result.isErr()) return err(result.error);

        return ok(result.value.map(castComment));
    }

    createReply(
        commentId: string,
        content: string,
        author: CommentAuthor,
    ): Result<Comment, DatabaseError | NotFoundError> {
        const parentResult = this.getCommentById(commentId);
        if (parentResult.isErr()) return err(parentResult.error);
        if (!parentResult.value) return err(notFound('Parent comment not found'));

        const parent = parentResult.value;
        const id = generateId();

        const insertResult = this.db.execute(
            `INSERT INTO comments (id, session_id, snapshot_id, reply_to_id, file_path, line_start, line_end, side, author, content, status)
             VALUES ($id, $sessionId, $snapshotId, $replyToId, $filePath, $lineStart, $lineEnd, $side, $author, $content, 'draft')`,
            {
                $id: id,
                $sessionId: parent.session_id,
                $snapshotId: parent.snapshot_id,
                $replyToId: commentId,
                $filePath: parent.file_path,
                $lineStart: parent.line_start,
                $lineEnd: parent.line_end,
                $side: parent.side,
                $author: author,
                $content: content,
            },
        );
        if (insertResult.isErr()) return err(insertResult.error);

        const readResult = this.db.queryOne<CommentRow>('SELECT * FROM comments WHERE id = $id', { $id: id });
        if (readResult.isErr()) return err(readResult.error);
        if (!readResult.value) return err(notFound('Comment not found after creation'));

        const reply = castComment(readResult.value);

        this.sse.broadcast(parent.session_id, {
            type: 'comment-update',
            data: { session_id: parent.session_id, comment_id: id, action: 'created' },
        });

        return ok(reply);
    }

    getSessionComments(sessionId: string): Result<CommentThread[], DatabaseError> {
        const parentsResult = this.db.query<CommentRow>(
            `SELECT * FROM comments
             WHERE session_id = $sessionId AND reply_to_id IS NULL
             ORDER BY file_path, line_start, created_at`,
            { $sessionId: sessionId },
        );
        if (parentsResult.isErr()) return err(parentsResult.error);

        return this.buildThreads(parentsResult.value);
    }

    getCommentsForSnapshot(sessionId: string, snapshotId: string): Result<CommentThread[], DatabaseError> {
        const candidatesResult = this.db.query<CommentRow>(
            `SELECT c.* FROM comments c
             JOIN snapshots s ON c.snapshot_id = s.id
             WHERE c.session_id = $sessionId
               AND c.reply_to_id IS NULL
               AND c.status != 'resolved'
               AND s.created_at <= (SELECT created_at FROM snapshots WHERE id = $targetSnapshotId)
             ORDER BY c.file_path, c.line_start`,
            { $sessionId: sessionId, $targetSnapshotId: snapshotId },
        );
        if (candidatesResult.isErr()) return err(candidatesResult.error);

        const filesSummaryResult = this.db.queryOne<{ files_summary: string }>(
            'SELECT files_summary FROM snapshots WHERE id = $id',
            { $id: snapshotId },
        );
        if (filesSummaryResult.isErr()) return err(filesSummaryResult.error);

        let filePathSet: Set<string>;
        if (filesSummaryResult.value?.files_summary) {
            const filesSummary = JSON.parse(filesSummaryResult.value.files_summary) as FileSummary[];
            filePathSet = new Set(filesSummary.map((f) => f.path));
        } else {
            filePathSet = new Set();
        }

        const filteredParents = candidatesResult.value.filter(
            (row) => row.file_path === '[general]' || filePathSet.has(row.file_path),
        );

        return this.buildThreads(filteredParents);
    }

    markSent(ids: string[]): Result<Comment[], DatabaseError | NotFoundError> {
        if (ids.length === 0) return ok([]);

        return this.db
            .transaction(() => {
                const draftComments: Comment[] = [];

                for (const id of ids) {
                    const result = this.getCommentById(id);
                    if (result.isErr()) return err(result.error);
                    if (result.value && result.value.status === 'draft') {
                        draftComments.push(result.value);
                    }
                }

                for (const comment of draftComments) {
                    const updateResult = this.db.execute(
                        "UPDATE comments SET status = 'sent', sent_at = datetime('now') WHERE id = $id",
                        { $id: comment.id },
                    );
                    if (updateResult.isErr()) return err(updateResult.error);
                }

                const uniqueSnapshotIds = new Set(draftComments.map((c) => c.snapshot_id));
                for (const snapshotId of uniqueSnapshotIds) {
                    const updateResult = this.db.execute(
                        'UPDATE snapshots SET has_review_comments = 1 WHERE id = $snapshotId',
                        { $snapshotId: snapshotId },
                    );
                    if (updateResult.isErr()) return err(updateResult.error);
                }

                const updatedComments: Comment[] = [];
                for (const comment of draftComments) {
                    const readResult = this.db.queryOne<CommentRow>('SELECT * FROM comments WHERE id = $id', {
                        $id: comment.id,
                    });
                    if (readResult.isErr()) return err(readResult.error);
                    // TODO: this should be a notFoundError instead
                    if (!readResult.value) return err(databaseError('Comment not found after marking sent'));

                    updatedComments.push(castComment(readResult.value));
                }

                return ok(updatedComments);
            })
            .map((comments) => {
                for (const comment of comments) {
                    this.sse.broadcast(comment.session_id, {
                        type: 'comment-update',
                        data: { session_id: comment.session_id, comment_id: comment.id, action: 'sent' },
                    });
                }
                return comments;
            });
    }

    resolve(id: string): Result<Comment, DatabaseError | NotFoundError | ValidationError> {
        const existing = this.getCommentById(id);
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Comment not found'));

        const comment = existing.value;
        if (comment.status === 'draft') {
            return err(validation('Cannot resolve draft comments, send first'));
        }

        const updateResult = this.db.execute(
            "UPDATE comments SET status = 'resolved', resolved_at = datetime('now') WHERE id = $id",
            { $id: id },
        );
        if (updateResult.isErr()) return err(updateResult.error);

        const readResult = this.db.queryOne<CommentRow>('SELECT * FROM comments WHERE id = $id', { $id: id });
        if (readResult.isErr()) return err(readResult.error);
        if (!readResult.value) return err(notFound('Comment not found after resolving'));

        const resolved = castComment(readResult.value);

        this.sse.broadcast(resolved.session_id, {
            type: 'comment-update',
            data: { session_id: resolved.session_id, comment_id: id, action: 'resolved' },
        });

        return ok(resolved);
    }

    private getCommentById(id: string): Result<Comment | undefined, DatabaseError> {
        const result = this.db.queryOne<CommentRow>('SELECT * FROM comments WHERE id = $id', { $id: id });
        if (result.isErr()) return err(result.error);

        return ok(result.value ? castComment(result.value) : undefined);
    }

    private buildThreads(parents: CommentRow[]): Result<CommentThread[], DatabaseError> {
        if (parents.length === 0) return ok([]);

        const parentIds = parents.map((p) => p.id);
        const placeholders = parentIds.map((_, i) => `$p${i}`).join(', ');
        const params: Record<string, string> = {};
        for (let i = 0; i < parentIds.length; i++) {
            params[`$p${i}`] = parentIds[i];
        }

        const repliesResult = this.db.query<CommentRow>(
            `SELECT * FROM comments WHERE reply_to_id IN (${placeholders}) ORDER BY created_at`,
            params,
        );
        if (repliesResult.isErr()) return err(repliesResult.error);

        const replyMap = new Map<string, Comment[]>();
        for (const row of repliesResult.value) {
            const replies = replyMap.get(row.reply_to_id!) ?? [];
            replies.push(castComment(row));
            replyMap.set(row.reply_to_id!, replies);
        }

        return ok(
            parents.map((parent) => ({
                comment: castComment(parent),
                replies: replyMap.get(parent.id) ?? [],
            })),
        );
    }
}
