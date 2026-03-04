import { okAsync } from 'neverthrow';
import { vi } from 'vitest';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initInMemoryDatabase } from '../../db/client.js';
import { DbService } from '../db.service.js';
import type { GitService } from '../git.service.js';
import { RepoService } from '../repo.service.js';

function createMockGitService(overrides: Partial<GitService> = {}): GitService {
    return {
        isGitRepo: vi.fn().mockReturnValue(okAsync(true)) as any,
        getRemoteUrl: vi.fn().mockReturnValue(okAsync('https://github.com/user/repo.git')) as any,
        getDefaultBranch: vi.fn().mockReturnValue(okAsync('main')) as any,
        getCurrentBranch: vi.fn() as any,
        getHeadCommit: vi.fn() as any,
        getInfo: vi.fn() as any,
        getDiff: vi.fn() as any,
        listBranches: vi.fn() as any,
        scanForRepos: vi.fn() as any,
        ...overrides,
    } as GitService;
}

describe('RepoService', () => {
    let dbService: DbService;
    let gitService: GitService;
    let service: RepoService;

    beforeEach(async () => {
        const dbResult = await initInMemoryDatabase();
        const db = expectOk(dbResult);
        dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });
        gitService = createMockGitService();
        service = new RepoService(dbService, gitService);
    });

    afterEach(() => {
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    describe('createOrGetFromPath', () => {
        it('creates new repo when not in DB', async () => {
            const result = await service.createOrGetFromPath('/home/user/my-app');

            const { repo, isNew } = expectOk(result);
            expect(isNew).toBe(true);
            expect(repo.name).toBe('my-app');
            expect(repo.path).toBe('/home/user/my-app');
            expect(repo.remote_url).toBe('https://github.com/user/repo.git');
            expect(repo.base_branch).toBe('main');
        });

        it('creates separate repo for different path even with same remote URL', async () => {
            await service.createOrGetFromPath('/home/user/my-app');
            const result = await service.createOrGetFromPath('/tmp/my-app-clone');

            const { repo, isNew } = expectOk(result);
            expect(isNew).toBe(true);
            expect(repo.path).toBe('/tmp/my-app-clone');
            expect(repo.remote_url).toBe('https://github.com/user/repo.git');

            const repos = expectOk(service.listRepos());
            expect(repos).toHaveLength(2);
        });

        it('returns existing repo on duplicate call', async () => {
            await service.createOrGetFromPath('/home/user/my-app');
            const result = await service.createOrGetFromPath('/home/user/my-app');

            const { isNew } = expectOk(result);
            expect(isNew).toBe(false);
        });

        it('returns error for non-git directory', async () => {
            (gitService.isGitRepo as any).mockReturnValue(okAsync(false));

            const result = await service.createOrGetFromPath('/not/a/repo');

            const error = expectErr(result);
            expect(error.type).toBe('GIT_ERROR');
            expect((error as any).code).toBe('NOT_A_GIT_REPO');
        });

        it('handles null remote_url', async () => {
            (gitService.getRemoteUrl as any).mockReturnValue(okAsync(null));

            const result1 = await service.createOrGetFromPath('/home/user/local-repo');
            expect(expectOk(result1).isNew).toBe(true);

            // Same path again should find it
            const result2 = await service.createOrGetFromPath('/home/user/local-repo');
            expect(expectOk(result2).isNew).toBe(false);
        });
    });

    describe('listRepos', () => {
        it('returns repos with path', async () => {
            await service.createOrGetFromPath('/home/user/app-a');

            (gitService.getRemoteUrl as any).mockReturnValue(okAsync('https://github.com/user/app-b.git'));
            await service.createOrGetFromPath('/home/user/app-b');

            // Same remote as app-a but different path — creates separate entry
            (gitService.getRemoteUrl as any).mockReturnValue(okAsync('https://github.com/user/repo.git'));
            await service.createOrGetFromPath('/tmp/app-a-clone');

            const result = service.listRepos();
            const repos = expectOk(result);
            expect(repos).toHaveLength(3);
            expect(repos.map((r) => r.path)).toEqual(
                expect.arrayContaining(['/home/user/app-a', '/home/user/app-b', '/tmp/app-a-clone']),
            );
        });

        it('returns empty array for empty DB', () => {
            const result = service.listRepos();
            expect(expectOk(result)).toEqual([]);
        });
    });

    describe('deleteRepo', () => {
        it('removes repo', async () => {
            const createResult = await service.createOrGetFromPath('/home/user/my-app');
            const { repo } = expectOk(createResult);

            const deleteResult = service.deleteRepo(repo.id);
            expect(deleteResult.isOk()).toBe(true);

            const repos = service.listRepos();
            expect(expectOk(repos)).toHaveLength(0);
        });

        it('returns NOT_FOUND for nonexistent ID', () => {
            const result = service.deleteRepo('nonexistent');
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });
    });

    describe('updateRepo', () => {
        it('changes base_branch', async () => {
            const createResult = await service.createOrGetFromPath('/home/user/my-app');
            const { repo } = expectOk(createResult);

            const updateResult = service.updateRepo(repo.id, { baseBranch: 'develop' });
            expect(expectOk(updateResult).base_branch).toBe('develop');
        });

        it('returns NOT_FOUND for nonexistent ID', () => {
            const result = service.updateRepo('nonexistent', { baseBranch: 'develop' });
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });
    });
});
