import {
    type DatabaseError,
    type GitError,
    type NotFoundError,
    type Session,
    type SessionStatus,
    type SessionWithRepo,
    generateId,
    notFound,
} from '@agent-code-reviewer/shared';
import { type Result, type ResultAsync, err, ok } from 'neverthrow';
import type { DbService } from './db.service.js';
import type { GitService } from './git.service.js';

interface SessionRow {
    id: string;
    repo_id: string;
    branch: string;
    base_branch: string | null;
    status: SessionStatus;
    completed_at: string | null;
    completion_reason: string | null;
    is_watching: number;
    created_at: string;
}

interface SessionWithRepoRow extends SessionRow {
    repo_remote_url: string | null;
    repo_name: string;
    repo_path: string;
    repo_base_branch: string;
    repo_created_at: string;
}

function castSession(row: SessionRow): Session {
    return {
        id: row.id,
        repo_id: row.repo_id,
        branch: row.branch,
        base_branch: row.base_branch,
        status: row.status,
        completed_at: row.completed_at,
        completion_reason: row.completion_reason,
        is_watching: !!row.is_watching,
        created_at: row.created_at,
    };
}

function castSessionWithRepo(row: SessionWithRepoRow): SessionWithRepo {
    return {
        ...castSession(row),
        repo: {
            id: row.repo_id,
            remote_url: row.repo_remote_url,
            name: row.repo_name,
            path: row.repo_path,
            base_branch: row.repo_base_branch,
            created_at: row.repo_created_at,
        },
    };
}

export class SessionService {
    constructor(
        private dbService: DbService,
        private gitService: GitService,
    ) {}

    private getCompletionSummary(
        sessionId: string,
        watcherActive: boolean,
    ): Result<{ draft_count: number; unresolved_sent_count: number; watcher_active: boolean }, DatabaseError> {
        const draftCountResult = this.dbService.queryOne<{ count: number }>(
            "SELECT COUNT(*) as count FROM comments WHERE session_id = $sessionId AND status = 'draft'",
            { $sessionId: sessionId },
        );
        if (draftCountResult.isErr()) return err(draftCountResult.error);

        const unresolvedSentResult = this.dbService.queryOne<{ count: number }>(
            "SELECT COUNT(*) as count FROM comments WHERE session_id = $sessionId AND status = 'sent' AND reply_to_id IS NULL",
            { $sessionId: sessionId },
        );
        if (unresolvedSentResult.isErr()) return err(unresolvedSentResult.error);

        return ok({
            draft_count: draftCountResult.value?.count ?? 0,
            unresolved_sent_count: unresolvedSentResult.value?.count ?? 0,
            watcher_active: watcherActive,
        });
    }

    getSession(id: string): Result<SessionWithRepo, DatabaseError | NotFoundError> {
        const result = this.dbService.queryOne<SessionWithRepoRow>(
            `SELECT s.*, r.remote_url as repo_remote_url, r.name as repo_name,
                r.path as repo_path, r.base_branch as repo_base_branch,
                r.created_at as repo_created_at
            FROM sessions s
            JOIN repos r ON s.repo_id = r.id
            WHERE s.id = $id
            LIMIT 1`,
            { $id: id },
        );

        if (result.isErr()) return err(result.error);
        if (!result.value) return err(notFound('Session not found'));

        return ok(castSessionWithRepo(result.value));
    }

    getOrCreateSession(
        repoId: string,
        repoPath: string,
    ): ResultAsync<Session, GitError | DatabaseError | NotFoundError> {
        return this.gitService.getCurrentBranch(repoPath).andThen((branch) => {
            const existingActive = this.dbService.queryOne<SessionRow>(
                "SELECT * FROM sessions WHERE repo_id = $repoId AND branch = $branch AND status = 'active' LIMIT 1",
                { $repoId: repoId, $branch: branch },
            );
            if (existingActive.isErr()) return err(existingActive.error);
            if (existingActive.value) return ok(castSession(existingActive.value));

            const id = generateId();

            const insertResult = this.dbService.execute(
                "INSERT OR IGNORE INTO sessions (id, repo_id, branch, status) VALUES ($id, $repoId, $branch, 'active')",
                { $id: id, $repoId: repoId, $branch: branch },
            );
            if (insertResult.isErr()) return err(insertResult.error);

            const selectResult = this.dbService.queryOne<SessionRow>(
                "SELECT * FROM sessions WHERE repo_id = $repoId AND branch = $branch AND status = 'active' LIMIT 1",
                { $repoId: repoId, $branch: branch },
            );
            if (selectResult.isErr()) return err(selectResult.error);
            if (!selectResult.value) return err(notFound('Session not found after insert'));

            return ok(castSession(selectResult.value));
        });
    }

    updateBaseBranch(id: string, baseBranch: string): Result<Session, DatabaseError | NotFoundError> {
        const existing = this.dbService.queryOne<SessionRow>('SELECT * FROM sessions WHERE id = $id', { $id: id });
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Session not found'));

        const updateResult = this.dbService.execute('UPDATE sessions SET base_branch = $baseBranch WHERE id = $id', {
            $baseBranch: baseBranch,
            $id: id,
        });
        if (updateResult.isErr()) return err(updateResult.error);

        const updated = this.dbService.queryOne<SessionRow>('SELECT * FROM sessions WHERE id = $id', { $id: id });
        if (updated.isErr()) return err(updated.error);
        if (!updated.value) return err(notFound('Session not found after update'));

        return ok(castSession(updated.value));
    }

    completeSession(
        id: string,
        options: { force?: boolean; reason?: string },
    ): Result<
        {
            session: Session;
            summary: { draft_count: number; unresolved_sent_count: number; watcher_active: boolean };
            forced: boolean;
            blocked: boolean;
        },
        DatabaseError | NotFoundError
    > {
        const existing = this.dbService.queryOne<SessionRow>('SELECT * FROM sessions WHERE id = $id', { $id: id });
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Session not found'));

        const current = existing.value;
        const summaryResult = this.getCompletionSummary(id, !!current.is_watching);
        if (summaryResult.isErr()) return err(summaryResult.error);
        const summary = summaryResult.value;

        if (current.status === 'completed') {
            return ok({
                session: castSession(current),
                summary,
                forced: !!options.force,
                blocked: false,
            });
        }

        const blocked = summary.draft_count > 0 || summary.unresolved_sent_count > 0 || summary.watcher_active;
        if (blocked && !options.force) {
            return ok({
                session: castSession(current),
                summary,
                forced: false,
                blocked: true,
            });
        }

        const updateResult = this.dbService.execute(
            `UPDATE sessions
             SET status = 'completed',
                 completed_at = datetime('now'),
                 completion_reason = $reason,
                 is_watching = 0
             WHERE id = $id`,
            { $id: id, $reason: options.reason ?? null },
        );
        if (updateResult.isErr()) return err(updateResult.error);

        const updated = this.dbService.queryOne<SessionRow>('SELECT * FROM sessions WHERE id = $id', { $id: id });
        if (updated.isErr()) return err(updated.error);
        if (!updated.value) return err(notFound('Session not found after completion'));

        return ok({
            session: castSession(updated.value),
            summary,
            forced: !!options.force,
            blocked: false,
        });
    }

    listSessions(repoId?: string, status: SessionStatus | 'all' = 'all'): Result<Session[], DatabaseError> {
        const where: string[] = [];
        const params: Record<string, string> = {};

        if (repoId) {
            where.push('repo_id = $repoId');
            params['$repoId'] = repoId;
        }

        if (status !== 'all') {
            where.push('status = $status');
            params['$status'] = status;
        }

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const result = this.dbService.query<SessionRow>(
            `SELECT * FROM sessions
             ${whereClause}
             ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC`,
            params,
        );

        if (result.isErr()) return err(result.error);

        return ok(result.value.map(castSession));
    }
}
