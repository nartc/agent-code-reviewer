import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitService, type ScannedRepo } from '../git.service.js';

describe('GitService.scanForRepos', () => {
	let tmpRoot: string;
	let service: GitService;

	beforeEach(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), 'git-scan-'));
		service = new GitService();
	});

	afterEach(() => {
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	it('yields discovered repos', async () => {
		const repoA = join(tmpRoot, 'repo-a');
		const repoB = join(tmpRoot, 'repo-b');
		const notRepo = join(tmpRoot, 'not-repo');
		mkdirSync(repoA);
		mkdirSync(repoB);
		mkdirSync(notRepo);

		execSync('git init', { cwd: repoA, stdio: 'ignore' });
		execSync('git init', { cwd: repoB, stdio: 'ignore' });

		const repos: ScannedRepo[] = [];
		for await (const repo of service.scanForRepos([tmpRoot], 3)) {
			repos.push(repo);
		}

		expect(repos).toHaveLength(2);
		const names = repos.map((r) => r.name).sort();
		expect(names).toEqual(['repo-a', 'repo-b']);
		expect(repos[0].remoteUrl).toBeNull();
	});

	it('respects maxDepth', async () => {
		const level1 = join(tmpRoot, 'level1');
		const deepRepo = join(level1, 'deep-repo');
		mkdirSync(level1);
		mkdirSync(deepRepo);
		execSync('git init', { cwd: deepRepo, stdio: 'ignore' });

		// maxDepth=1: root(0) → level1(1) → deep-repo(2) exceeds maxDepth
		const repos1: ScannedRepo[] = [];
		for await (const repo of service.scanForRepos([tmpRoot], 1)) {
			repos1.push(repo);
		}
		expect(repos1).toHaveLength(0);

		// maxDepth=2 should find it
		const repos2: ScannedRepo[] = [];
		for await (const repo of service.scanForRepos([tmpRoot], 2)) {
			repos2.push(repo);
		}
		expect(repos2).toHaveLength(1);
		expect(repos2[0].name).toBe('deep-repo');
	});

	it('yields nothing for empty root', async () => {
		const repos: ScannedRepo[] = [];
		for await (const repo of service.scanForRepos([tmpRoot], 3)) {
			repos.push(repo);
		}
		expect(repos).toHaveLength(0);
	});
});
