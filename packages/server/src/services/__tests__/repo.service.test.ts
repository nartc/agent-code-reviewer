import { okAsync } from 'neverthrow';
import { vi } from 'vitest';
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
		expect(dbResult.isOk()).toBe(true);
		const db = dbResult._unsafeUnwrap();
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
		it('creates new repo + path when not in DB', async () => {
			const result = await service.createOrGetFromPath('/home/user/my-app');

			expect(result.isOk()).toBe(true);
			const { repo, repoPath, isNew } = result._unsafeUnwrap();
			expect(isNew).toBe(true);
			expect(repo.name).toBe('my-app');
			expect(repo.remote_url).toBe('https://github.com/user/repo.git');
			expect(repo.base_branch).toBe('main');
			expect(repoPath.path).toBe('/home/user/my-app');
			expect(repoPath.repo_id).toBe(repo.id);
		});

		it('finds existing repo via remote URL and adds new path', async () => {
			// First call creates
			await service.createOrGetFromPath('/home/user/my-app');

			// Second call from different path with same remote
			const result = await service.createOrGetFromPath('/tmp/my-app-clone');

			expect(result.isOk()).toBe(true);
			const { repo, repoPath, isNew } = result._unsafeUnwrap();
			expect(isNew).toBe(false);
			expect(repo.remote_url).toBe('https://github.com/user/repo.git');
			expect(repoPath.path).toBe('/tmp/my-app-clone');
		});

		it('returns existing repo + existing path on duplicate call', async () => {
			await service.createOrGetFromPath('/home/user/my-app');
			const result = await service.createOrGetFromPath('/home/user/my-app');

			expect(result.isOk()).toBe(true);
			const { isNew } = result._unsafeUnwrap();
			expect(isNew).toBe(false);
		});

		it('returns error for non-git directory', async () => {
			(gitService.isGitRepo as any).mockReturnValue(
				okAsync(false),
			);

			const result = await service.createOrGetFromPath('/not/a/repo');

			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().type).toBe('NOT_A_GIT_REPO');
		});

		it('handles null remote_url with path-based lookup', async () => {
			(gitService.getRemoteUrl as any).mockReturnValue(
				okAsync(null),
			);

			const result1 = await service.createOrGetFromPath('/home/user/local-repo');
			expect(result1.isOk()).toBe(true);
			expect(result1._unsafeUnwrap().isNew).toBe(true);

			// Same path again should find it
			const result2 = await service.createOrGetFromPath('/home/user/local-repo');
			expect(result2.isOk()).toBe(true);
			expect(result2._unsafeUnwrap().isNew).toBe(false);
		});
	});

	describe('listRepos', () => {
		it('returns RepoWithPaths[] with correct nested paths', async () => {
			// Create two repos
			await service.createOrGetFromPath('/home/user/app-a');

			(gitService.getRemoteUrl as any).mockReturnValue(
				okAsync('https://github.com/user/app-b.git'),
			);
			await service.createOrGetFromPath('/home/user/app-b');

			// Add second path to first repo
			(gitService.getRemoteUrl as any).mockReturnValue(
				okAsync('https://github.com/user/repo.git'),
			);
			await service.createOrGetFromPath('/tmp/app-a-clone');

			const result = service.listRepos();
			expect(result.isOk()).toBe(true);
			const repos = result._unsafeUnwrap();
			expect(repos).toHaveLength(2);

			// Find the repo with 2 paths
			const repoWithTwoPaths = repos.find((r) => r.remote_url === 'https://github.com/user/repo.git');
			expect(repoWithTwoPaths).toBeDefined();
			expect(repoWithTwoPaths!.paths).toHaveLength(2);

			const repoWithOnePath = repos.find((r) => r.remote_url === 'https://github.com/user/app-b.git');
			expect(repoWithOnePath).toBeDefined();
			expect(repoWithOnePath!.paths).toHaveLength(1);
		});

		it('returns empty array for empty DB', () => {
			const result = service.listRepos();
			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toEqual([]);
		});
	});

	describe('deleteRepo', () => {
		it('removes repo and cascading paths', async () => {
			const createResult = await service.createOrGetFromPath('/home/user/my-app');
			const { repo } = createResult._unsafeUnwrap();

			const deleteResult = service.deleteRepo(repo.id);
			expect(deleteResult.isOk()).toBe(true);

			// Verify repo is gone
			const repos = service.listRepos();
			expect(repos._unsafeUnwrap()).toHaveLength(0);

			// Verify paths are gone
			const paths = service.getRepoPaths(repo.id);
			expect(paths._unsafeUnwrap()).toHaveLength(0);
		});

		it('returns NOT_FOUND for nonexistent ID', () => {
			const result = service.deleteRepo('nonexistent');
			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().type).toBe('NOT_FOUND');
		});
	});

	describe('updateRepo', () => {
		it('changes base_branch', async () => {
			const createResult = await service.createOrGetFromPath('/home/user/my-app');
			const { repo } = createResult._unsafeUnwrap();

			const updateResult = service.updateRepo(repo.id, { baseBranch: 'develop' });
			expect(updateResult.isOk()).toBe(true);
			expect(updateResult._unsafeUnwrap().base_branch).toBe('develop');
		});

		it('returns NOT_FOUND for nonexistent ID', () => {
			const result = service.updateRepo('nonexistent', { baseBranch: 'develop' });
			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().type).toBe('NOT_FOUND');
		});
	});

	describe('getRepoPaths', () => {
		it('returns paths for given repoId', async () => {
			const createResult = await service.createOrGetFromPath('/home/user/my-app');
			const { repo } = createResult._unsafeUnwrap();

			// Add second path
			await service.createOrGetFromPath('/tmp/my-app-clone');

			const result = service.getRepoPaths(repo.id);
			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toHaveLength(2);
		});

		it('returns empty array for repo with no paths', () => {
			const result = service.getRepoPaths('nonexistent-repo');
			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toEqual([]);
		});
	});
});
