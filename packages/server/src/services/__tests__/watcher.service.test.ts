import { type FileSummary, type GitError, generateId } from '@agent-code-reviewer/shared';
import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initInMemoryDatabase } from '../../db/client.js';
import { DbService } from '../db.service.js';
import type { GitService } from '../git.service.js';
import { SessionService } from '../session.service.js';
import type { SseService } from '../sse.service.js';
import { WatcherService, computeChangedFiles } from '../watcher.service.js';

function createMockGitService(overrides: Partial<GitService> = {}): GitService {
    return {
        getCurrentBranch: vi.fn().mockReturnValue(okAsync('feature/x')) as any,
        isGitRepo: vi.fn().mockReturnValue(okAsync(true)) as any,
        getRemoteUrl: vi.fn().mockReturnValue(okAsync('https://github.com/user/repo.git')) as any,
        getDefaultBranch: vi.fn().mockReturnValue(okAsync('main')) as any,
        getHeadCommit: vi.fn().mockReturnValue(okAsync('abc123')) as any,
        getInfo: vi.fn() as any,
        getDiff: vi.fn().mockReturnValue(
            okAsync({
                rawDiff: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts',
                files: [{ path: 'src/a.ts', status: 'modified', additions: 5, deletions: 2 }] as FileSummary[],
            }),
        ) as any,
        listBranches: vi.fn() as any,
        scanForRepos: vi.fn() as any,
        fetchOrigin: vi.fn().mockReturnValue(okAsync(undefined)) as any,
        resolveBaseBranchRef: vi
            .fn()
            .mockImplementation((_path: string, baseBranch: string) => okAsync(baseBranch)) as any,
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

        const dbResult = await initInMemoryDatabase();
        expect(dbResult.isOk()).toBe(true);
        const db = expectOk(dbResult);
        dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });

        gitService = createMockGitService();
        sseService = createMockSseService();
        sessionService = new SessionService(dbService, gitService);

        service = new WatcherService(dbService, gitService, sessionService, sseService);

        // Seed repo + session
        repoId = generateId();
        dbService.execute(
            "INSERT INTO repos (id, remote_url, name, path, base_branch) VALUES ($id, $url, $name, $path, 'main')",
            {
                $id: repoId,
                $url: 'https://github.com/user/test.git',
                $name: 'test-repo',
                $path: '/repo',
            },
        );

        const sessionResult = await sessionService.getOrCreateSession(repoId, '/repo');
        sessionId = expectOk(sessionResult).id;
    });

    afterEach(() => {
        service.stopAll();
        vi.useRealTimers();
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    describe('startWatching', () => {
        it('starts HEAD polling (AC-2.1)', async () => {
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
            await service.startWatching(sessionId, '/repo');
            const result = await service.startWatching(sessionId, '/repo');

            expect(result.isOk()).toBe(true);
        });

        it('fails for non-existent session (AC-2.3)', async () => {
            const result = await service.startWatching('sess-999', '/repo');

            expect(result.isErr()).toBe(true);
            expect(expectErr(result).type).toBe('NOT_FOUND');
        });

        it('fails for completed sessions', async () => {
            const complete = sessionService.completeSession(sessionId, { force: true, reason: 'done' });
            expect(complete.isOk()).toBe(true);

            const result = await service.startWatching(sessionId, '/repo');
            expect(result.isErr()).toBe(true);
            expect(expectErr(result).type).toBe('VALIDATION');
        });
    });

    describe('stopWatching', () => {
        it('cleans up (AC-2.4)', async () => {
            await service.startWatching(sessionId, '/repo');
            const result = await service.stopWatching(sessionId);

            expect(result.isOk()).toBe(true);
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

    describe('HEAD polling', () => {
        it('captures snapshot when HEAD changes (AC-2.6)', async () => {
            await service.startWatching(sessionId, '/repo');

            // Change HEAD on next poll
            (gitService.getHeadCommit as any).mockReturnValue(okAsync('def456'));

            await vi.advanceTimersByTimeAsync(3000);
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

        it('does not capture snapshot when HEAD unchanged', async () => {
            await service.startWatching(sessionId, '/repo');

            // HEAD stays the same
            await vi.advanceTimersByTimeAsync(3000);
            expect(gitService.getDiff).not.toHaveBeenCalled();
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
            const dbRow = dbService.queryOne<{
                session_id: string;
                raw_diff: string;
                files_summary: string;
                head_commit: string;
                trigger: string;
                has_review_comments: number;
            }>('SELECT * FROM snapshots WHERE session_id = $sessionId', { $sessionId: sessionId });
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

        it('calls fetchOrigin and resolveBaseBranchRef', async () => {
            await service.captureSnapshot(sessionId, '/repo', 'manual');

            expect(gitService.fetchOrigin).toHaveBeenCalledWith('/repo');
            expect(gitService.resolveBaseBranchRef).toHaveBeenCalledWith('/repo', 'main');
        });

        it('computes changed files delta (AC-2.10)', async () => {
            // First snapshot
            (gitService.getHeadCommit as any).mockReturnValue(okAsync('commit1'));
            (gitService.getDiff as any).mockReturnValue(
                okAsync({
                    rawDiff: 'diff1',
                    files: [
                        { path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
                        { path: 'b.ts', status: 'added', additions: 10, deletions: 0 },
                    ] as FileSummary[],
                }),
            );
            await service.captureSnapshot(sessionId, '/repo', 'manual');

            // Second snapshot — a.ts same, b.ts removed, c.ts added
            (gitService.getHeadCommit as any).mockReturnValue(okAsync('commit2'));
            (gitService.getDiff as any).mockReturnValue(
                okAsync({
                    rawDiff: 'diff2',
                    files: [
                        { path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
                        { path: 'c.ts', status: 'added', additions: 3, deletions: 0 },
                    ] as FileSummary[],
                }),
            );
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
            const rows = dbService.query<{ id: string }>('SELECT id FROM snapshots WHERE session_id = $sessionId', {
                $sessionId: sessionId,
            });
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
            expect(gitService.resolveBaseBranchRef).toHaveBeenCalledWith('/repo', 'develop');

            // Reset and test fallback
            (gitService.resolveBaseBranchRef as any).mockClear();

            // Need to re-nullify base_branch via direct DB update since updateBaseBranch doesn't accept null
            dbService.execute('UPDATE sessions SET base_branch = NULL WHERE id = $id', { $id: sessionId });

            await service.captureSnapshot(sessionId, '/repo', 'manual');
            expect(gitService.resolveBaseBranchRef).toHaveBeenCalledWith('/repo', 'main');
        });

        it('rejects snapshot capture for completed session', async () => {
            const complete = sessionService.completeSession(sessionId, { force: true, reason: 'done' });
            expect(complete.isOk()).toBe(true);

            const result = await service.captureSnapshot(sessionId, '/repo', 'manual');
            expect(result.isErr()).toBe(true);
            expect(expectErr(result).type).toBe('VALIDATION');
        });
    });

    describe('stopAll', () => {
        it('stops all watchers (AC-2.16)', async () => {
            // Create another session
            const repoId2 = generateId();
            dbService.execute("INSERT INTO repos (id, name, path, base_branch) VALUES ($id, 'repo2', $path, 'main')", {
                $id: repoId2,
                $path: '/repo2',
            });
            const session2Result = await sessionService.getOrCreateSession(repoId2, '/repo2');
            const sessionId2 = expectOk(session2Result).id;

            await service.startWatching(sessionId, '/repo');
            await service.startWatching(sessionId2, '/repo2');

            expect(service.isWatching(sessionId)).toBe(true);
            expect(service.isWatching(sessionId2)).toBe(true);

            service.stopAll();

            expect(service.isWatching(sessionId)).toBe(false);
            expect(service.isWatching(sessionId2)).toBe(false);
        });
    });
});

describe('computeChangedFiles', () => {
    const makeDiff = (files: Record<string, string>) =>
        Object.entries(files)
            .map(([path, content]) => `diff --git a/${path} b/${path}\n${content}`)
            .join('\n');

    it('returns empty for first snapshot (no previous)', () => {
        const current: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }];
        expect(computeChangedFiles(current, [], 'diff', '')).toEqual([]);
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
        const prevDiff = makeDiff({ 'a.ts': 'same', 'b.ts': 'old' });
        const curDiff = makeDiff({ 'a.ts': 'same', 'c.ts': 'new' });
        const result = computeChangedFiles(current, previous, curDiff, prevDiff);
        expect(result).toEqual(expect.arrayContaining(['b.ts', 'c.ts']));
        expect(result).toHaveLength(2);
    });

    it('detects modified files (different additions/deletions)', () => {
        const previous: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }];
        const current: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 10, deletions: 2 }];
        const prevDiff = makeDiff({ 'a.ts': 'v1' });
        const curDiff = makeDiff({ 'a.ts': 'v2' });
        expect(computeChangedFiles(current, previous, curDiff, prevDiff)).toEqual(['a.ts']);
    });

    it('detects content changes even when stats are identical', () => {
        const previous: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }];
        const current: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }];
        const prevDiff = makeDiff({ 'a.ts': '-old line\n+new line' });
        const curDiff = makeDiff({ 'a.ts': '-old line\n+different line' });
        expect(computeChangedFiles(current, previous, curDiff, prevDiff)).toEqual(['a.ts']);
    });

    it('returns empty when diffs are identical', () => {
        const previous: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }];
        const current: FileSummary[] = [{ path: 'a.ts', status: 'modified', additions: 5, deletions: 2 }];
        const diff = makeDiff({ 'a.ts': 'same content' });
        expect(computeChangedFiles(current, previous, diff, diff)).toEqual([]);
    });
});
