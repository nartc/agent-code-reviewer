import {
	type AppError,
	type Session,
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
	is_watching: number;
	created_at: string;
}

interface SessionWithRepoRow extends SessionRow {
	repo_remote_url: string | null;
	repo_name: string;
	repo_base_branch: string;
	repo_created_at: string;
	repo_path_id: string | null;
	repo_path_path: string | null;
	repo_path_last_accessed_at: string | null;
	repo_path_created_at: string | null;
}

function castSession(row: SessionRow): Session {
	return {
		id: row.id,
		repo_id: row.repo_id,
		branch: row.branch,
		base_branch: row.base_branch,
		is_watching: !!row.is_watching,
		created_at: row.created_at,
	};
}

function castSessionWithRepo(row: SessionWithRepoRow): SessionWithRepo {
	return {
		id: row.id,
		repo_id: row.repo_id,
		branch: row.branch,
		base_branch: row.base_branch,
		is_watching: !!row.is_watching,
		created_at: row.created_at,
		repo: {
			id: row.repo_id,
			remote_url: row.repo_remote_url,
			name: row.repo_name,
			base_branch: row.repo_base_branch,
			created_at: row.repo_created_at,
		},
		repo_path: {
			id: row.repo_path_id ?? '',
			repo_id: row.repo_id,
			path: row.repo_path_path ?? '',
			last_accessed_at: row.repo_path_last_accessed_at,
			created_at: row.repo_path_created_at ?? '',
		},
	};
}

export class SessionService {
	constructor(
		private dbService: DbService,
		private gitService: GitService,
	) {}

	getSession(id: string): Result<SessionWithRepo, AppError> {
		const result = this.dbService.queryOne<SessionWithRepoRow>(
			`SELECT s.*, r.remote_url as repo_remote_url, r.name as repo_name,
				r.base_branch as repo_base_branch, r.created_at as repo_created_at,
				rp.id as repo_path_id, rp.path as repo_path_path,
				rp.last_accessed_at as repo_path_last_accessed_at,
				rp.created_at as repo_path_created_at
			FROM sessions s
			JOIN repos r ON s.repo_id = r.id
			LEFT JOIN repo_paths rp ON rp.repo_id = r.id
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
	): ResultAsync<Session, AppError> {
		return this.gitService.getCurrentBranch(repoPath).andThen((branch) => {
			const id = generateId();

			const insertResult = this.dbService.execute(
				'INSERT OR IGNORE INTO sessions (id, repo_id, branch) VALUES ($id, $repoId, $branch)',
				{ $id: id, $repoId: repoId, $branch: branch },
			);
			if (insertResult.isErr()) return err(insertResult.error);

			const selectResult = this.dbService.queryOne<SessionRow>(
				'SELECT * FROM sessions WHERE repo_id = $repoId AND branch = $branch',
				{ $repoId: repoId, $branch: branch },
			);
			if (selectResult.isErr()) return err(selectResult.error);

			return ok(castSession(selectResult.value!));
		});
	}

	updateBaseBranch(
		id: string,
		baseBranch: string,
	): Result<Session, AppError> {
		const existing = this.dbService.queryOne<SessionRow>(
			'SELECT * FROM sessions WHERE id = $id',
			{ $id: id },
		);
		if (existing.isErr()) return err(existing.error);
		if (!existing.value) return err(notFound('Session not found'));

		const updateResult = this.dbService.execute(
			'UPDATE sessions SET base_branch = $baseBranch WHERE id = $id',
			{ $baseBranch: baseBranch, $id: id },
		);
		if (updateResult.isErr()) return err(updateResult.error);

		const updated = this.dbService.queryOne<SessionRow>(
			'SELECT * FROM sessions WHERE id = $id',
			{ $id: id },
		);
		if (updated.isErr()) return err(updated.error);

		return ok(castSession(updated.value!));
	}

	listSessions(repoId?: string): Result<Session[], AppError> {
		let result: Result<SessionRow[], AppError>;

		if (repoId) {
			result = this.dbService.query<SessionRow>(
				'SELECT * FROM sessions WHERE repo_id = $repoId ORDER BY created_at DESC',
				{ $repoId: repoId },
			);
		} else {
			result = this.dbService.query<SessionRow>(
				'SELECT * FROM sessions ORDER BY created_at DESC',
			);
		}

		if (result.isErr()) return err(result.error);

		return ok(result.value.map(castSession));
	}
}
