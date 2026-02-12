import {
	type DatabaseError,
	type GitError,
	type NotFoundError,
	type Repo,
	type RepoPath,
	type RepoWithPaths,
	generateId,
	notAGitRepo,
	notFound,
} from '@agent-code-reviewer/shared';
import { type Result, type ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { basename } from 'node:path';
import type { DbService } from './db.service.js';
import type { GitService } from './git.service.js';

type CreateOrGetResult = { repo: Repo; repoPath: RepoPath; isNew: boolean };

export class RepoService {
	constructor(
		private dbService: DbService,
		private gitService: GitService,
	) {}

	listRepos(): Result<RepoWithPaths[], DatabaseError> {
		const reposResult = this.dbService.query<Repo>(
			'SELECT * FROM repos ORDER BY created_at DESC',
		);
		if (reposResult.isErr()) return err(reposResult.error);

		const repos = reposResult.value;
		const result: RepoWithPaths[] = [];

		for (const repo of repos) {
			const pathsResult = this.dbService.query<RepoPath>(
				'SELECT * FROM repo_paths WHERE repo_id = $repoId',
				{ $repoId: repo.id },
			);
			if (pathsResult.isErr()) return err(pathsResult.error);
			result.push({ ...repo, paths: pathsResult.value });
		}

		return ok(result);
	}

	createOrGetFromPath(path: string): ResultAsync<CreateOrGetResult, GitError | DatabaseError> {
		return this.gitService.isGitRepo(path).andThen((isRepo) => {
			if (!isRepo) {
				return errAsync<CreateOrGetResult, GitError | DatabaseError>(notAGitRepo(path));
			}

			return this.gitService.getRemoteUrl(path).andThen((remoteUrl) => {
				if (remoteUrl !== null) {
					return this.findOrCreateByRemoteUrl(path, remoteUrl);
				}
				return this.findOrCreateByPath(path);
			});
		});
	}

	deleteRepo(id: string): Result<void, DatabaseError | NotFoundError> {
		const existing = this.dbService.queryOne<Repo>(
			'SELECT * FROM repos WHERE id = $id',
			{ $id: id },
		);
		if (existing.isErr()) return err(existing.error);
		if (!existing.value) return err(notFound('Repo not found'));

		const deleteResult = this.dbService.execute(
			'DELETE FROM repos WHERE id = $id',
			{ $id: id },
		);
		if (deleteResult.isErr()) return err(deleteResult.error);

		return ok(undefined);
	}

	updateRepo(
		id: string,
		update: { baseBranch: string },
	): Result<Repo, DatabaseError | NotFoundError> {
		const existing = this.dbService.queryOne<Repo>(
			'SELECT * FROM repos WHERE id = $id',
			{ $id: id },
		);
		if (existing.isErr()) return err(existing.error);
		if (!existing.value) return err(notFound('Repo not found'));

		const updateResult = this.dbService.execute(
			'UPDATE repos SET base_branch = $baseBranch WHERE id = $id',
			{ $baseBranch: update.baseBranch, $id: id },
		);
		if (updateResult.isErr()) return err(updateResult.error);

		const updated = this.dbService.queryOne<Repo>(
			'SELECT * FROM repos WHERE id = $id',
			{ $id: id },
		);
		if (updated.isErr()) return err(updated.error);

		return ok(updated.value!);
	}

	getRepoPaths(repoId: string): Result<RepoPath[], DatabaseError> {
		return this.dbService.query<RepoPath>(
			'SELECT * FROM repo_paths WHERE repo_id = $repoId',
			{ $repoId: repoId },
		);
	}

	private findOrCreateByRemoteUrl(
		path: string,
		remoteUrl: string,
	): ResultAsync<CreateOrGetResult, GitError | DatabaseError> {
		const existingRepo = this.dbService.queryOne<Repo>(
			'SELECT * FROM repos WHERE remote_url = $url',
			{ $url: remoteUrl },
		);

		if (existingRepo.isErr()) return errAsync(existingRepo.error);

		if (existingRepo.value) {
			return this.ensureRepoPath(existingRepo.value, path, false);
		}

		return this.createNewRepo(path, remoteUrl);
	}

	private findOrCreateByPath(
		path: string,
	): ResultAsync<CreateOrGetResult, GitError | DatabaseError> {
		const existingRepo = this.dbService.queryOne<Repo>(
			'SELECT r.* FROM repos r JOIN repo_paths rp ON r.id = rp.repo_id WHERE rp.path = $path',
			{ $path: path },
		);

		if (existingRepo.isErr()) return errAsync(existingRepo.error);

		if (existingRepo.value) {
			return this.ensureRepoPath(existingRepo.value, path, false);
		}

		return this.createNewRepo(path, null);
	}

	private ensureRepoPath(
		repo: Repo,
		path: string,
		isNew: boolean,
	): ResultAsync<CreateOrGetResult, DatabaseError> {
		const existingPath = this.dbService.queryOne<RepoPath>(
			'SELECT * FROM repo_paths WHERE repo_id = $repoId AND path = $path',
			{ $repoId: repo.id, $path: path },
		);

		if (existingPath.isErr()) return errAsync(existingPath.error);

		if (existingPath.value) {
			return okAsync({ repo, repoPath: existingPath.value, isNew: false });
		}

		const pathId = generateId();
		const insertResult = this.dbService.execute(
			'INSERT INTO repo_paths (id, repo_id, path) VALUES ($id, $repoId, $path)',
			{ $id: pathId, $repoId: repo.id, $path: path },
		);

		if (insertResult.isErr()) return errAsync(insertResult.error);

		const newPath = this.dbService.queryOne<RepoPath>(
			'SELECT * FROM repo_paths WHERE id = $id',
			{ $id: pathId },
		);

		if (newPath.isErr()) return errAsync(newPath.error);

		return okAsync({ repo, repoPath: newPath.value!, isNew });
	}

	private createNewRepo(
		path: string,
		remoteUrl: string | null,
	): ResultAsync<CreateOrGetResult, GitError | DatabaseError> {
		return this.gitService.getDefaultBranch(path).andThen((baseBranch) => {
			const repoId = generateId();
			const pathId = generateId();
			const name = basename(path);

			const txResult = this.dbService.transaction(() => {
				const insertRepo = this.dbService.execute(
					'INSERT INTO repos (id, remote_url, name, base_branch) VALUES ($id, $remoteUrl, $name, $baseBranch)',
					{
						$id: repoId,
						$remoteUrl: remoteUrl,
						$name: name,
						$baseBranch: baseBranch,
					},
				);
				if (insertRepo.isErr()) return err(insertRepo.error);

				const insertPath = this.dbService.execute(
					'INSERT INTO repo_paths (id, repo_id, path) VALUES ($id, $repoId, $path)',
					{ $id: pathId, $repoId: repoId, $path: path },
				);
				if (insertPath.isErr()) return err(insertPath.error);

				return ok(undefined);
			});

			if (txResult.isErr()) return err(txResult.error);

			const repo = this.dbService.queryOne<Repo>(
				'SELECT * FROM repos WHERE id = $id',
				{ $id: repoId },
			);
			if (repo.isErr()) return err(repo.error);

			const repoPath = this.dbService.queryOne<RepoPath>(
				'SELECT * FROM repo_paths WHERE id = $id',
				{ $id: pathId },
			);
			if (repoPath.isErr()) return err(repoPath.error);

			return ok({ repo: repo.value!, repoPath: repoPath.value!, isNew: true });
		});
	}
}
