import { simpleGit } from 'simple-git';
import { vi } from 'vitest';
import { GitService } from '../git.service.js';

vi.mock('simple-git');

const mockedSimpleGit = vi.mocked(simpleGit);

function createGitStub(overrides: Record<string, any> = {}) {
	return {
		checkIsRepo: vi.fn().mockResolvedValue(true),
		revparse: vi.fn().mockResolvedValue('abc123'),
		raw: vi.fn().mockResolvedValue('origin/main'),
		listRemote: vi.fn().mockResolvedValue('https://github.com/user/repo.git\n'),
		branch: vi.fn().mockResolvedValue({ all: ['main', 'feature/x'], current: 'main' }),
		diff: vi.fn().mockResolvedValue('diff output'),
		diffSummary: vi.fn().mockResolvedValue({
			files: [{ file: 'src/foo.ts', insertions: 5, deletions: 2, binary: false }],
		}),
		...overrides,
	};
}

describe('GitService', () => {
	let service: GitService;
	let gitStub: ReturnType<typeof createGitStub>;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new GitService();
		gitStub = createGitStub();
		mockedSimpleGit.mockReturnValue(gitStub as any);
	});

	describe('isGitRepo', () => {
		it('returns true for a git repo', async () => {
			gitStub.checkIsRepo.mockResolvedValue(true);

			const result = await service.isGitRepo('/some/path');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe(true);
		});

		it('returns false for a non-git directory', async () => {
			gitStub.checkIsRepo.mockResolvedValue(false);

			const result = await service.isGitRepo('/not/a/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe(false);
		});

		it('returns false when path does not exist', async () => {
			gitStub.checkIsRepo.mockRejectedValue(new Error('path not found'));

			const result = await service.isGitRepo('/nonexistent');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe(false);
		});
	});

	describe('getInfo', () => {
		it('returns aggregated GitInfo for valid repo', async () => {
			gitStub.checkIsRepo.mockResolvedValue(true);
			gitStub.listRemote.mockResolvedValue('git@github.com:user/repo.git\n');
			gitStub.revparse.mockImplementation((args: string[]) => {
				if (args[0] === '--abbrev-ref') return Promise.resolve('main\n');
				if (args[0] === 'HEAD') return Promise.resolve('abc123def\n');
				return Promise.resolve('');
			});
			gitStub.raw.mockResolvedValue('origin/main\n');

			const result = await service.getInfo('/repo');

			expect(result.isOk()).toBe(true);
			const info = result._unsafeUnwrap();
			expect(info.remoteUrl).toBe('git@github.com:user/repo.git');
			expect(info.currentBranch).toBe('main');
			expect(info.defaultBranch).toBe('main');
			expect(info.headCommit).toBe('abc123def');
		});

		it('returns NOT_A_GIT_REPO error for non-repo', async () => {
			gitStub.checkIsRepo.mockResolvedValue(false);

			const result = await service.getInfo('/not/repo');

			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().type).toBe('NOT_A_GIT_REPO');
		});
	});

	describe('getDiff', () => {
		it('returns rawDiff and FileSummary[]', async () => {
			gitStub.diff.mockResolvedValue('diff --git a/src/foo.ts b/src/foo.ts\n...');
			gitStub.diffSummary.mockResolvedValue({
				files: [
					{ file: 'src/foo.ts', insertions: 5, deletions: 2, binary: false },
					{ file: 'src/bar.ts', insertions: 10, deletions: 0, binary: false },
					{ file: 'src/old.ts', insertions: 0, deletions: 8, binary: false },
					{ file: 'src/{old => new}.ts', insertions: 1, deletions: 1, binary: false },
				],
			});

			const result = await service.getDiff('/repo', 'main');

			expect(result.isOk()).toBe(true);
			const { rawDiff, files } = result._unsafeUnwrap();
			expect(rawDiff).toContain('diff --git');
			expect(files).toHaveLength(4);
			expect(files[0]).toEqual({ path: 'src/foo.ts', status: 'modified', additions: 5, deletions: 2 });
			expect(files[1]).toEqual({ path: 'src/bar.ts', status: 'added', additions: 10, deletions: 0 });
			expect(files[2]).toEqual({ path: 'src/old.ts', status: 'deleted', additions: 0, deletions: 8 });
			expect(files[3]).toEqual({ path: 'src/{old => new}.ts', status: 'renamed', additions: 1, deletions: 1 });
		});

		it('returns GIT_ERROR when simple-git throws', async () => {
			gitStub.diff.mockRejectedValue(new Error('git diff failed'));

			const result = await service.getDiff('/repo', 'main');

			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().type).toBe('GIT_ERROR');
			expect(result._unsafeUnwrapErr().message).toContain('git diff failed');
		});
	});

	describe('getCurrentBranch', () => {
		it('returns trimmed branch name', async () => {
			gitStub.revparse.mockResolvedValue('feature/foo\n');

			const result = await service.getCurrentBranch('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe('feature/foo');
		});
	});

	describe('getDefaultBranch', () => {
		it('returns branch from symbolic-ref when available', async () => {
			gitStub.raw.mockResolvedValue('origin/main\n');

			const result = await service.getDefaultBranch('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe('main');
		});

		it('falls back to master when symbolic-ref fails and master exists', async () => {
			gitStub.raw.mockRejectedValue(new Error('no symbolic-ref'));
			gitStub.branch.mockResolvedValue({ all: ['master', 'develop'], current: 'develop' });

			const result = await service.getDefaultBranch('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe('master');
		});

		it('falls back to main when no recognizable branch', async () => {
			gitStub.raw.mockRejectedValue(new Error('no symbolic-ref'));
			gitStub.branch.mockResolvedValue({ all: ['develop', 'feature/x'], current: 'develop' });

			const result = await service.getDefaultBranch('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe('main');
		});
	});

	describe('getRemoteUrl', () => {
		it('returns remote URL when present', async () => {
			gitStub.listRemote.mockResolvedValue('https://github.com/user/repo.git\n');

			const result = await service.getRemoteUrl('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe('https://github.com/user/repo.git');
		});

		it('returns null when no remote', async () => {
			gitStub.listRemote.mockResolvedValue('/repo\n');

			const result = await service.getRemoteUrl('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBeNull();
		});

		it('returns null for empty remote', async () => {
			gitStub.listRemote.mockResolvedValue('\n');

			const result = await service.getRemoteUrl('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBeNull();
		});
	});

	describe('listBranches', () => {
		it('returns branch name array', async () => {
			gitStub.branch.mockResolvedValue({
				all: ['main', 'feature/x', 'remotes/origin/main'],
				current: 'main',
			});

			const result = await service.listBranches('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toEqual(['main', 'feature/x', 'remotes/origin/main']);
		});
	});

	describe('getHeadCommit', () => {
		it('returns full SHA trimmed', async () => {
			gitStub.revparse.mockResolvedValue('abc123def456789\n');

			const result = await service.getHeadCommit('/repo');

			expect(result.isOk()).toBe(true);
			expect(result._unsafeUnwrap()).toBe('abc123def456789');
		});
	});

	describe('error mapping', () => {
		it('maps simple-git Error to GIT_ERROR AppError with message preserved', async () => {
			const originalError = new Error('authentication failed');
			gitStub.revparse.mockRejectedValue(originalError);

			const result = await service.getHeadCommit('/repo');

			expect(result.isErr()).toBe(true);
			const appError = result._unsafeUnwrapErr();
			expect(appError.type).toBe('GIT_ERROR');
			expect(appError.message).toBe('authentication failed');
			expect(appError.cause).toBe(originalError);
		});
	});

});
