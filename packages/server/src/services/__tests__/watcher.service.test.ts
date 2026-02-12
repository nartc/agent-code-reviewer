import { type FileSummary, type GitError, generateId } from '@agent-code-reviewer/shared';
import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initInMemoryDatabase } from '../../db/client.js';
import { DbService } from '../db.service.js';
import type { GitService } from '../git.service.js';
import { SessionService } from '../session.service.js';
import type { SseService } from '../sse.service.js';
import { WatcherService, computeChangedFiles, createIgnoreFunction } from '../watcher.service.js';

// Mock chokidar
const mockWatcherClose = vi.fn().mockResolvedValue(undefined);
const mockWatcherOn = vi.fn();
let capturedAllHandler: (() => void) | null = null;

vi.mock('chokidar', () => ({
	watch: vi.fn(() => {
		const watcher = {
			on: vi.fn((event: string, handler: () => void) => {
				if (event === 'all') capturedAllHandler = handler;
				mockWatcherOn(event, handler);
				return watcher;
			}),
			close: mockWatcherClose,
		};
		return watcher;
	}),
}));

function createMockGitService(overrides: Partial<GitService> = {}): GitService {
	return {
		getCurrentBranch: vi.fn().mockReturnValue(okAsync('feature/x')) as any,
		isGitRepo: vi.fn().mockReturnValue(okAsync(true)) as any,
		getRemoteUrl: vi.fn().mockReturnValue(okAsync('https://github.com/user/repo.git')) as any,
		getDefaultBranch: vi.fn().mockReturnValue(okAsync('main')) as any,
		getHeadCommit: vi.fn().mockReturnValue(okAsync('abc123')) as any,
		getInfo: vi.fn() as any,
		getDiff: vi.fn().mockReturnValue(okAsync({
			rawDiff: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts',
			files: [{ path: 'src/a.ts', status: 'modified', additions: 5, deletions: 2 }] as FileSummary[],
		})) as any,
		listBranches: vi.fn() as any,
		scanForRepos: vi.fn() as any,
		...overrides,
	} as GitService;
}

function createMockSseService(): SseService {
	return {
		addConnection: vi.fn(),
		removeConnection: vi.fn(),
		broadcast: vi.fn(),
		getConnectionCount: vi.fn().mockReturnValue(0),
		shutdown: vi.fn(),
	} as unknown as SseService;
}

describe('WatcherService', () => {
	let dbService: DbService;
	let gitService: GitService;
	let sessionService: SessionService;
	let sseService: SseService;
	let service: WatcherService;
	let repoId: string;
	let sessionId: string;

	beforeEach(async () => {
		vi.useFakeTimers();
		capturedAllHandler = null;
		mockWatcherClose.mockReset().mockResolvedValue(undefined);
		mockWatcherOn.mockReset();
		const chokidar = await import('chokidar');
		vi.mocked(chokidar.watch).mockClear();

		const dbResult = await initInMemoryDatabase();
		expect(dbResult.isOk()).toBe(true);
		const db = expectOk(dbResult);
		dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });

		gitService = createMockGitService();
		sseService = createMockSseService();
		sessionService = new SessionService(dbService, gitService);

		service = new WatcherService(dbService, gitService, sessionService, sseService);

		// Seed repo + repo_path + session
		repoId = generateId();
		const repoPathId = generateId();
		dbService.execute(
			"INSERT INTO repos (id, remote_url, name, base_branch) VALUES ($id, $url, $name, 'main')",
			{ $id: repoId, $url: 'https://github.com/user/test.git', $name: 'test-repo' },
		);
		dbService.execute(
			'INSERT INTO repo_paths (id, repo_id, path) VALUES ($id, $repoId, $path)',
			{ $id: repoPathId, $repoId: repoId, $path: '/repo' },
		);

		const sessionResult = await sessionService.getOrCreateSession(repoId, '/repo');
		sessionId = expectOk(sessionResult).id;
	});

	afterEach(async () => {
		await service.stopAll();
		vi.useRealTimers();
		try {
			dbService.close();
		} catch {
			// ignore
		}
	});

	describe('startWatching', () => {
		it('creates a file watcher (AC-2.1)', async () => {
			const result = await service.startWatching(sessionId, '/repo');

			expect(result.isOk()).toBe(true);
			expect(service.isWatching(sessionId)).toBe(true);

			// Verify DB updated
			const dbRow = dbService.queryOne<{ is_watching: number }>(
				'SELECT is_watching FROM sessions WHERE id = $id',
				{ $id: sessionId },
			);
			expect(expectOk(dbRow)!.is_watching).toBe(1);

			// Verify SSE broadcast
			expect(sseService.broadcast).toHaveBeenCalledWith(sessionId, {
				type: 'watcher-status',
				data: { session_id: sessionId, is_watching: true },
			});
		});

		it('is idempotent (AC-2.2)', async () => {
			const { watch } = await import('chokidar');

			await service.startWatching(sessionId, '/repo');
			const result = await service.startWatching(sessionId, '/repo');

			expect(result.isOk()).toBe(true);
			expect(watch).toHaveBeenCalledTimes(1);
		});

		it('fails for non-existent session (AC-2.3)', async () => {
			const result = await service.startWatching('sess-999', '/repo');

			expect(result.isErr()).toBe(true);
			expect(expectErr(result).type).toBe('NOT_FOUND');
		});
	});

	describe('stopWatching', () => {
		it('cleans up (AC-2.4)', async () => {
			await service.startWatching(sessionId, '/repo');
			const result = await service.stopWatching(sessionId);

			expect(result.isOk()).toBe(true);
			expect(mockWatcherClose).toHaveBeenCalled();
			expect(service.isWatching(sessionId)).toBe(false);

			const dbRow = dbService.queryOne<{ is_watching: number }>(
				'SELECT is_watching FROM sessions WHERE id = $id',
				{ $id: sessionId },
			);
			expect(expectOk(dbRow)!.is_watching).toBe(0);

			expect(sseService.broadcast).toHaveBeenCalledWith(sessionId, {
				type: 'watcher-status',
				data: { session_id: sessionId, is_watching: false },
			});
		});

		it('is idempotent (AC-2.5)', async () => {
			const result = await service.stopWatching(sessionId);

			expect(result.isOk()).toBe(true);
		});
	});

	describe('debounce', () => {
		it('file change triggers snapshot after 1.5s debounce (AC-2.6)', async () => {
			await service.startWatching(sessionId, '/repo');

			// Fire file change
			capturedAllHandler!();

			// Before debounce
			await vi.advanceTimersByTimeAsync(1499);
			expect(gitService.getDiff).not.toHaveBeenCalled();

			// After debounce
			await vi.advanceTimersByTimeAsync(1);
			expect(gitService.getDiff).toHaveBeenCalled();

			// Verify snapshot in DB
			const rows = dbService.query<{ session_id: string; trigger: string }>(
				'SELECT session_id, trigger FROM snapshots WHERE session_id = $sessionId',
				{ $sessionId: sessionId },
			);
			const rowData = expectOk(rows);
			expect(rowData).toHaveLength(1);
			expect(rowData[0].trigger).toBe('fs_watch');
		});

		it('debounce resets on rapid changes (AC-2.7)', async () => {
			await service.startWatching(sessionId, '/repo');

			// File change at t=0
			capturedAllHandler!();

			// File change at t=500ms
			await vi.advanceTimersByTimeAsync(500);
			capturedAllHandler!();

			// File change at t=1000ms
			await vi.advanceTimersByTimeAsync(500);
			capturedAllHandler!();

			// At t=1500ms (first debounce would have fired but was reset)
			await vi.advanceTimersByTimeAsync(500);
			expect(gitService.getDiff).not.toHaveBeenCalled();

			// At t=2500ms (1000 + 1500 debounce)
			await vi.advanceTimersByTimeAsync(1000);
			expect(gitService.getDiff).toHaveBeenCalledTimes(1);
		});

		it('enforces minimum 3s gap between snapshots (AC-2.8)', async () => {
			await service.startWatching(sessionId, '/repo');

			// First snapshot at t=0 (trigger immediately to set lastSnapshotAt)
			capturedAllHandler!();
			await vi.advanceTimersByTimeAsync(1500);
			expect(gitService.getDiff).toHaveBeenCalledTimes(1);

			// File change at t=1500ms (1s after snapshot at t=1500ms effective)
			// Actually let's be precise: snapshot completed at ~1500ms
			// File change at t=2000ms
			await vi.advanceTimersByTimeAsync(500);
			capturedAllHandler!();

			// Debounce fires at t=3500ms (2000 + 1500)
			// At that point, elapsed = 3500 - 1500 = 2000ms < 3000ms
			// remaining = 1000ms → reschedule to t=4500ms
			await vi.advanceTimersByTimeAsync(1500);
			expect(gitService.getDiff).toHaveBeenCalledTimes(1); // Not yet

			// At t=4500ms, the rescheduled timer fires
			await vi.advanceTimersByTimeAsync(1000);
			expect(gitService.getDiff).toHaveBeenCalledTimes(2);
		});
	});

	describe('captureSnapshot', () => {
		it('persists correct data (AC-2.9)', async () => {
			const result = await service.captureSnapshot(sessionId, '/repo', 'manual');

			const snapshot = expectOk(result);
			expect(snapshot.session_id).toBe(sessionId);
			expect(snapshot.trigger).toBe('manual');
			expect(snapshot.head_commit).toBe('abc123');
			expect(snapshot.has_review_comments).toBe(false);

			// Verify DB row
			const dbRow = dbService.queryOne<{ session_id: string; raw_diff: string; files_summary: string; head_commit: string; trigger: string; has_review_comments: number }>(
				'SELECT * FROM snapshots WHERE session_id = $sessionId',
				{ $sessionId: sessionId },
			);
			const row = expectOk(dbRow)!;
			expect(row.session_id).toBe(sessionId);
			expect(row.raw_diff).toContain('diff --git');
			expect(row.head_commit).toBe('abc123');
			expect(row.trigger).toBe('manual');
			expect(row.has_review_comments).toBe(0);
			expect(JSON.parse(row.files_summary)).toEqual([
				{ path: 'src/a.ts', status: 'modified', additions: 5, deletions: 2 },
			]);
		});

		it('computes changed files delta (AC-2.10)', async () => {
			// First snapshot
			(gitService.getDiff as any).mockReturnValue(okAsync({
				rawDiff: 'diff1',
				files: [
					{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
					{ path: 'b.ts', status: 'added', additions: 10, deletions: 0 },
				] as FileSummary[],
			}));
			await service.captureSnapshot(sessionId, '/repo', 'manual');

			// Second snapshot — a.ts same, b.ts removed, c.ts added
			(gitService.getDiff as any).mockReturnValue(okAsync({
				rawDiff: 'diff2',
				files: [
					{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
					{ path: 'c.ts', status: 'added', additions: 3, deletions: 0 },
				] as FileSummary[],
			}));
			const result = await service.captureSnapshot(sessionId, '/repo', 'manual');

			const snapshot = expectOk(result);
			expect(snapshot.changed_files).toEqual(expect.arrayContaining(['b.ts', 'c.ts']));
			expect(snapshot.changed_files).toHaveLength(2);
		});

		it('returns null changed_files for first snapshot (AC-2.11)', async () => {
			const result = await service.captureSnapshot(sessionId, '/repo', 'manual');

			expect(expectOk(result).changed_files).toBeNull();
		});

		it('broadcasts SSE event without raw_diff (AC-2.12)', async () => {
			await service.captureSnapshot(sessionId, '/repo', 'manual');

			expect(sseService.broadcast).toHaveBeenCalledWith(
				sessionId,
				expect.objectContaining({
					type: 'snapshot',
					data: expect.not.objectContaining({ raw_diff: expect.anything() }),
				}),
			);

			const broadcastCall = (sseService.broadcast as ReturnType<typeof vi.fn>).mock.calls[0];
			const event = broadcastCall[1];
			expect(event.data).not.toHaveProperty('raw_diff');
		});

		it('handles git error (AC-2.13)', async () => {
			(gitService.getDiff as any).mockReturnValue(
				errAsync({ type: 'GIT_ERROR', code: 'OPERATION_FAILED', message: 'git failed' } as GitError),
			);

			const result = await service.captureSnapshot(sessionId, '/repo', 'manual');

			expect(expectErr(result).type).toBe('GIT_ERROR');

			// No snapshot inserted
			const rows = dbService.query<{ id: string }>(
				'SELECT id FROM snapshots WHERE session_id = $sessionId',
				{ $sessionId: sessionId },
			);
			expect(expectOk(rows)).toHaveLength(0);
		});

		it('handles DB insert error (AC-2.14)', async () => {
			// Make the INSERT fail by dropping the table
			dbService.execute('DROP TABLE snapshots');

			const result = await service.captureSnapshot(sessionId, '/repo', 'manual');

			expect(expectErr(result).type).toBe('DATABASE_ERROR');

			// No SSE broadcast for snapshot
			expect(sseService.broadcast).not.toHaveBeenCalledWith(
				sessionId,
				expect.objectContaining({ type: 'snapshot' }),
			);
		});

		it('uses session.base_branch when set, falls back to repo.base_branch (AC-2.17)', async () => {
			// With session base_branch = 'develop'
			sessionService.updateBaseBranch(sessionId, 'develop');

			await service.captureSnapshot(sessionId, '/repo', 'manual');
			expect(gitService.getDiff).toHaveBeenCalledWith('/repo', 'develop');

			// Reset and test fallback
			(gitService.getDiff as any).mockClear();
			sessionService.updateBaseBranch(sessionId, null as any);

			// Need to re-nullify base_branch via direct DB update since updateBaseBranch doesn't accept null
			dbService.execute('UPDATE sessions SET base_branch = NULL WHERE id = $id', { $id: sessionId });

			await service.captureSnapshot(sessionId, '/repo', 'manual');
			expect(gitService.getDiff).toHaveBeenCalledWith('/repo', 'main');
		});
	});

	describe('stopAll', () => {
		it('closes all watchers (AC-2.16)', async () => {
			// Create another session
			const repoId2 = generateId();
			dbService.execute(
				"INSERT INTO repos (id, name, base_branch) VALUES ($id, 'repo2', 'main')",
				{ $id: repoId2 },
			);
			dbService.execute(
				'INSERT INTO repo_paths (id, repo_id, path) VALUES ($id, $repoId, $path)',
				{ $id: generateId(), $repoId: repoId2, $path: '/repo2' },
			);
			const session2Result = await sessionService.getOrCreateSession(repoId2, '/repo2');
			const sessionId2 = expectOk(session2Result).id;

			await service.startWatching(sessionId, '/repo');
			await service.startWatching(sessionId2, '/repo2');

			expect(service.isWatching(sessionId)).toBe(true);
			expect(service.isWatching(sessionId2)).toBe(true);

			await service.stopAll();

			expect(service.isWatching(sessionId)).toBe(false);
			expect(service.isWatching(sessionId2)).toBe(false);
			expect(mockWatcherClose).toHaveBeenCalledTimes(2);
		});
	});
});

describe('createIgnoreFunction', () => {
	const ignoreFn = createIgnoreFunction();

	it.each([
		['/repo/node_modules/foo/bar.js', true, 'node_modules'],
		['/repo/.git/HEAD', true, '.git'],
		['/repo/dist/index.js', true, 'dist'],
		['/repo/build/output.js', true, 'build'],
		['/repo/.next/cache', true, '.next'],
		['/repo/.cache/file', true, '.cache'],
		['/repo/coverage/lcov.info', true, 'coverage'],
		['/repo/__pycache__/mod.pyc', true, '__pycache__'],
		['/repo/.venv/bin/python', true, '.venv'],
		['/repo/.DS_Store', true, '.DS_Store'],
		['/repo/src/app.ts', false, 'normal source'],
		['/repo/src/utils/build-helpers.ts', false, 'build as substring'],
	])('ignores %s → %s (%s) (AC-2.15)', (path, expected, _reason) => {
		expect(ignoreFn(path)).toBe(expected);
	});
});

describe('computeChangedFiles', () => {
	it('returns empty for first snapshot (no previous)', () => {
		const current: FileSummary[] = [
			{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
		];
		expect(computeChangedFiles(current, [])).toEqual([]);
	});

	it('detects added and removed files', () => {
		const previous: FileSummary[] = [
			{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
			{ path: 'b.ts', status: 'added', additions: 10, deletions: 0 },
		];
		const current: FileSummary[] = [
			{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
			{ path: 'c.ts', status: 'added', additions: 3, deletions: 0 },
		];
		const result = computeChangedFiles(current, previous);
		expect(result).toEqual(expect.arrayContaining(['b.ts', 'c.ts']));
		expect(result).toHaveLength(2);
	});

	it('detects modified files (different additions/deletions)', () => {
		const previous: FileSummary[] = [
			{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
		];
		const current: FileSummary[] = [
			{ path: 'a.ts', status: 'modified', additions: 10, deletions: 2 },
		];
		expect(computeChangedFiles(current, previous)).toEqual(['a.ts']);
	});
});
