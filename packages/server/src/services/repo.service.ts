import {
    type DatabaseError,
    type GitError,
    type NotFoundError,
    type Repo,
    generateId,
    notAGitRepo,
    notFound,
} from '@agent-code-reviewer/shared';
import { type Result, type ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { basename } from 'node:path';
import type { DbService } from './db.service.js';
import type { GitService } from './git.service.js';

type CreateOrGetResult = { repo: Repo; isNew: boolean };

export class RepoService {
    constructor(
        private dbService: DbService,
        private gitService: GitService,
    ) {}

    listRepos(): Result<Repo[], DatabaseError> {
        return this.dbService.query<Repo>('SELECT * FROM repos ORDER BY created_at DESC');
    }

    createOrGetFromPath(path: string): ResultAsync<CreateOrGetResult, GitError | DatabaseError | NotFoundError> {
        return this.gitService.isGitRepo(path).andThen((isRepo) => {
            if (!isRepo) {
                return errAsync(notAGitRepo(path));
            }

            const existing = this.dbService.queryOne<Repo>('SELECT * FROM repos WHERE path = $path', { $path: path });
            if (existing.isErr()) return errAsync(existing.error);
            if (existing.value) return okAsync({ repo: existing.value, isNew: false });

            return this.gitService.getRemoteUrl(path).andThen((remoteUrl) =>
                this.gitService.getDefaultBranch(path).andThen((baseBranch) => {
                    const id = generateId();
                    const name = basename(path);

                    const insertResult = this.dbService.execute(
                        'INSERT INTO repos (id, remote_url, name, path, base_branch) VALUES ($id, $remoteUrl, $name, $path, $baseBranch)',
                        { $id: id, $remoteUrl: remoteUrl, $name: name, $path: path, $baseBranch: baseBranch },
                    );
                    if (insertResult.isErr()) return err(insertResult.error);

                    const repo = this.dbService.queryOne<Repo>('SELECT * FROM repos WHERE id = $id', { $id: id });
                    if (repo.isErr()) return err(repo.error);

                    return ok({ repo: repo.value!, isNew: true });
                }),
            );
        });
    }

    deleteRepo(id: string): Result<void, DatabaseError | NotFoundError> {
        const existing = this.dbService.queryOne<Repo>('SELECT * FROM repos WHERE id = $id', { $id: id });
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Repo not found'));

        const deleteResult = this.dbService.execute('DELETE FROM repos WHERE id = $id', { $id: id });
        if (deleteResult.isErr()) return err(deleteResult.error);

        return ok(undefined);
    }

    updateRepo(id: string, update: { baseBranch: string }): Result<Repo, DatabaseError | NotFoundError> {
        const existing = this.dbService.queryOne<Repo>('SELECT * FROM repos WHERE id = $id', { $id: id });
        if (existing.isErr()) return err(existing.error);
        if (!existing.value) return err(notFound('Repo not found'));

        const updateResult = this.dbService.execute('UPDATE repos SET base_branch = $baseBranch WHERE id = $id', {
            $baseBranch: update.baseBranch,
            $id: id,
        });
        if (updateResult.isErr()) return err(updateResult.error);

        const updated = this.dbService.queryOne<Repo>('SELECT * FROM repos WHERE id = $id', { $id: id });
        if (updated.isErr()) return err(updated.error);
        if (!updated.value) return err(notFound('Repo not found after update'));

        return ok(updated.value);
    }
}
