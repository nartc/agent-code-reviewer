import type { FileSummary, Snapshot, SnapshotSummary } from '@agent-code-reviewer/shared';
import { listSnapshotsQuerySchema, notFound } from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { err, ok } from 'neverthrow';
import { asyncResultToResponse, resultToResponse } from '../lib/result-to-response.js';
import type { DbService } from '../services/db.service.js';
import type { SessionService } from '../services/session.service.js';
import type { WatcherService } from '../services/watcher.service.js';
import { idParamSchema } from './params.js';

interface SnapshotRow {
    id: string;
    session_id: string;
    raw_diff: string;
    files_summary: string;
    head_commit: string | null;
    trigger: string;
    changed_files: string | null;
    has_review_comments: number;
    created_at: string;
}

function castSnapshotSummary(row: SnapshotRow): SnapshotSummary {
    return {
        id: row.id,
        session_id: row.session_id,
        files_summary: JSON.parse(row.files_summary) as FileSummary[],
        head_commit: row.head_commit,
        trigger: row.trigger as Snapshot['trigger'],
        changed_files: row.changed_files ? (JSON.parse(row.changed_files) as string[]) : null,
        has_review_comments: !!row.has_review_comments,
        created_at: row.created_at,
    };
}

function castSnapshot(row: SnapshotRow): Snapshot {
    return {
        ...castSnapshotSummary(row),
        raw_diff: row.raw_diff,
    };
}

export function createSnapshotRoutes(
    dbService: DbService,
    watcherService: WatcherService,
    sessionService: SessionService,
): Hono {
    const app = new Hono();

    // GET /sessions/:id/snapshots — List summaries (paginated)
    app.get(
        '/sessions/:id/snapshots',
        zValidator('param', idParamSchema),
        zValidator('query', listSnapshotsQuerySchema),
        (c) => {
            const { id } = c.req.valid('param');
            const query = c.req.valid('query');
            const limit = query.limit ? parseInt(query.limit, 10) : 50;
            const before = query.before;

            let sql: string;
            let params: Record<string, string | number | null>;

            if (before) {
                sql = `SELECT id, session_id, files_summary, head_commit, trigger, changed_files, has_review_comments, created_at
                   FROM snapshots
                   WHERE session_id = $sessionId AND created_at < $before
                   ORDER BY created_at DESC
                   LIMIT $limit`;
                params = { $sessionId: id, $before: before, $limit: limit };
            } else {
                sql = `SELECT id, session_id, files_summary, head_commit, trigger, changed_files, has_review_comments, created_at
                   FROM snapshots
                   WHERE session_id = $sessionId
                   ORDER BY created_at DESC
                   LIMIT $limit`;
                params = { $sessionId: id, $limit: limit };
            }

            const result = dbService.query<SnapshotRow>(sql, params);
            return resultToResponse(
                c,
                result.map((rows) => ({ snapshots: rows.map(castSnapshotSummary) })),
            );
        },
    );

    // GET /snapshots/:id/diff — Full snapshot with raw_diff
    app.get('/snapshots/:id/diff', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        const result = dbService
            .queryOne<SnapshotRow>('SELECT * FROM snapshots WHERE id = $id', { $id: id })
            .andThen((row) => (row ? ok({ snapshot: castSnapshot(row) }) : err(notFound('Snapshot not found'))));
        return resultToResponse(c, result);
    });

    // POST /sessions/:id/snapshots — Manual capture
    app.post('/sessions/:id/snapshots', zValidator('param', idParamSchema), async (c) => {
        const { id } = c.req.valid('param');
        const sessionResult = sessionService.getSession(id);
        if (sessionResult.isErr()) {
            return resultToResponse(c, sessionResult);
        }
        const repoPath = sessionResult.value.repo_path.path;
        return asyncResultToResponse(c, watcherService.captureSnapshot(id, repoPath, 'manual'), 201);
    });

    return app;
}
