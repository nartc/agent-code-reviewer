import type { FileSummary } from '@agent-code-reviewer/shared';
import { type GitError, gitError, notAGitRepo } from '@agent-code-reviewer/shared';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { simpleGit } from 'simple-git';

export interface GitInfo {
    remoteUrl: string | null;
    currentBranch: string;
    defaultBranch: string;
    headCommit: string;
}

export interface ScannedRepo {
    path: string;
    name: string;
    remoteUrl: string | null;
}

function mapToGitError(e: unknown): GitError {
    const message = e instanceof Error ? e.message : String(e);
    return gitError(message, e);
}

export class GitService {
    isGitRepo(path: string): ResultAsync<boolean, never> {
        return ResultAsync.fromPromise(simpleGit(path).checkIsRepo(), (e) => e).orElse((error) => {
            console.error(`[git] isGitRepo check failed for ${path}:`, error);
            return okAsync(false);
        });
    }

    getInfo(path: string): ResultAsync<GitInfo, GitError> {
        return this.isGitRepo(path).andThen((isRepo) => {
            if (!isRepo) {
                return errAsync(notAGitRepo(path));
            }

            return ResultAsync.combine([
                this.getRemoteUrl(path),
                this.getCurrentBranch(path),
                this.getDefaultBranch(path),
                this.getHeadCommit(path),
            ]).map(([remoteUrl, currentBranch, defaultBranch, headCommit]) => ({
                remoteUrl,
                currentBranch,
                defaultBranch,
                headCommit,
            }));
        });
    }

    getDiff(path: string, baseBranch: string): ResultAsync<{ rawDiff: string; files: FileSummary[] }, GitError> {
        return ResultAsync.fromPromise(
            Promise.all([simpleGit(path).diff([baseBranch]), simpleGit(path).diffSummary([baseBranch])]).then(
                ([rawDiff, summary]) => {
                    const files: FileSummary[] = summary.files.map((file) => {
                        const insertions = 'insertions' in file ? file.insertions : 0;
                        const deletions = 'deletions' in file ? file.deletions : 0;

                        let status: FileSummary['status'];
                        if (file.file.includes('=>')) {
                            status = 'renamed';
                        } else if (insertions > 0 && deletions === 0) {
                            status = 'added';
                        } else if (deletions > 0 && insertions === 0) {
                            status = 'deleted';
                        } else {
                            status = 'modified';
                        }

                        return {
                            path: file.file,
                            status,
                            additions: insertions,
                            deletions,
                        };
                    });
                    return { rawDiff, files };
                },
            ),
            mapToGitError,
        );
    }

    getCurrentBranch(path: string): ResultAsync<string, GitError> {
        return ResultAsync.fromPromise(
            simpleGit(path)
                .revparse(['--abbrev-ref', 'HEAD'])
                .then((r) => r.trim()),
            mapToGitError,
        );
    }

    getDefaultBranch(path: string): ResultAsync<string, GitError> {
        return ResultAsync.fromPromise(
            simpleGit(path)
                .raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
                .then((r) => {
                    const trimmed = r.trim();
                    const parts = trimmed.split('/');
                    return parts[parts.length - 1];
                }),
            () => null,
        ).orElse(() =>
            ResultAsync.fromPromise(
                simpleGit(path)
                    .branch()
                    .then((branchInfo) => {
                        if (branchInfo.all.includes('main')) return 'main';
                        if (branchInfo.all.includes('master')) return 'master';
                        return 'main';
                    }),
                (error) => gitError('Failed to detect default branch', error),
            ),
        );
    }

    getRemoteUrl(path: string): ResultAsync<string | null, GitError> {
        return ResultAsync.fromPromise(
            simpleGit(path)
                .listRemote(['--get-url'])
                .then((r) => {
                    const trimmed = r.trim();
                    if (!trimmed || trimmed === path) return null;
                    return trimmed;
                }),
            mapToGitError,
        );
    }

    listBranches(path: string): ResultAsync<string[], GitError> {
        return ResultAsync.fromPromise(
            simpleGit(path)
                .branch()
                .then((r) => r.all),
            mapToGitError,
        );
    }

    getHeadCommit(path: string): ResultAsync<string, GitError> {
        return ResultAsync.fromPromise(
            simpleGit(path)
                .revparse(['HEAD'])
                .then((r) => r.trim()),
            mapToGitError,
        );
    }

    async *scanForRepos(roots: string[], maxDepth: number): AsyncGenerator<ScannedRepo> {
        for (const root of roots) {
            yield* this.walkForRepos(root, maxDepth, 0);
        }
    }

    private async *walkForRepos(dir: string, maxDepth: number, currentDepth: number): AsyncGenerator<ScannedRepo> {
        if (currentDepth > maxDepth) return;

        const isRepoResult = await this.isGitRepo(dir);
        if (isRepoResult.isOk() && isRepoResult.value) {
            let remoteUrl: string | null = null;
            try {
                const result = await this.getRemoteUrl(dir);
                if (result.isOk()) {
                    remoteUrl = result.value;
                }
            } catch {
                // skip remote URL on error
            }

            yield {
                path: dir,
                name: basename(dir),
                remoteUrl,
            };
            return; // don't recurse into git repos
        }

        let entries: Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return; // skip unreadable directories
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.')) continue;
            yield* this.walkForRepos(join(dir, entry.name), maxDepth, currentDepth + 1);
        }
    }
}
