import type { FileSummary, Snapshot, SnapshotSummary } from '@agent-code-reviewer/shared';
import { listSnapshotsQuerySchema, notFound } from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { err, ok } from 'neverthrow';
import { z } from 'zod';
import { asyncResultToResponse, resultToResponse } from '../lib/result-to-response.js';
import type { DbService } from '../services/db.service.js';
import type { GitService } from '../services/git.service.js';
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

const fileContentQuerySchema = z.object({
    file: z.string().min(1),
});

export function createSnapshotRoutes(
    dbService: DbService,
    watcherService: WatcherService,
    sessionService: SessionService,
    gitService: GitService,
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
        return asyncResultToResponse(c, watcherService.captureSnapshot(id, repoPath, 'manual'), 201);
    });

    // GET /snapshots/:id/file-content?file=path/to/file — Get old+new file contents for expansion
    app.get(
        '/snapshots/:id/file-content',
        zValidator('param', idParamSchema),
        zValidator('query', fileContentQuerySchema),
        async (c) => {
            const { id } = c.req.valid('param');
            const { file } = c.req.valid('query');

            const snapshotResult = dbService.queryOne<SnapshotRow>('SELECT * FROM snapshots WHERE id = $id', {
                $id: id,
            });
            if (snapshotResult.isErr()) return resultToResponse(c, snapshotResult);
            if (!snapshotResult.value)
                return c.json({ error: { code: 'NOT_FOUND', message: 'Snapshot not found' } }, 404);

            const snapshot = snapshotResult.value;
            const sessionResult = sessionService.getSession(snapshot.session_id);
            if (sessionResult.isErr()) return resultToResponse(c, sessionResult);

            const session = sessionResult.value;
            const repoPath = session.repo.path;
            const baseBranch = session.base_branch ?? session.repo.base_branch;

            const resolvedRefResult = await gitService.resolveBaseBranchRef(repoPath, baseBranch);
            const baseRef = resolvedRefResult.isOk() ? resolvedRefResult.value : baseBranch;
            const headRef = snapshot.head_commit ?? 'HEAD';

            const [oldResult, newResult] = await Promise.all([
                gitService.getFileContent(repoPath, baseRef, file),
                gitService.getFileContent(repoPath, headRef, file),
            ]);

            return c.json({
                oldContent: oldResult.isOk() ? oldResult.value : null,
                newContent: newResult.isOk() ? newResult.value : null,
            });
        },
    );

    return app;
}
