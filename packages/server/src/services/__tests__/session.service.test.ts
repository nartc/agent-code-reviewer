import { generateId } from '@agent-code-reviewer/shared';
import { okAsync } from 'neverthrow';
import { vi } from 'vitest';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initInMemoryDatabase } from '../../db/client.js';
import { DbService } from '../db.service.js';
import type { GitService } from '../git.service.js';
import { SessionService } from '../session.service.js';

function createMockGitService(branch = 'feature/x'): GitService {
    return {
        getCurrentBranch: vi.fn().mockReturnValue(okAsync(branch)) as any,
        isGitRepo: vi.fn() as any,
        getRemoteUrl: vi.fn() as any,
        getDefaultBranch: vi.fn() as any,
        getHeadCommit: vi.fn() as any,
        getInfo: vi.fn() as any,
        getDiff: vi.fn() as any,
        listBranches: vi.fn() as any,
        scanForRepos: vi.fn() as any,
    } as GitService;
}

describe('SessionService', () => {
    let dbService: DbService;
    let gitService: GitService;
    let service: SessionService;
    let repoId: string;

    beforeEach(async () => {
        const dbResult = await initInMemoryDatabase();
        expect(dbResult.isOk()).toBe(true);
        const db = expectOk(dbResult);
        dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });
        gitService = createMockGitService();
        service = new SessionService(dbService, gitService);

        // Seed a repo for FK constraints
        repoId = generateId();
        dbService.execute(
            "INSERT INTO repos (id, remote_url, name, path, base_branch) VALUES ($id, $url, $name, $path, 'main')",
            {
                $id: repoId,
                $url: 'https://github.com/user/test.git',
                $name: 'test-repo',
                $path: '/home/user/test-repo',
            },
        );
    });

    afterEach(() => {
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    describe('getOrCreateSession', () => {
        it('creates new session for new branch', async () => {
            const result = await service.getOrCreateSession(repoId, '/home/user/test-repo');

            const session = expectOk(result);
            expect(session.repo_id).toBe(repoId);
            expect(session.branch).toBe('feature/x');
            expect(session.status).toBe('active');
            expect(session.completed_at).toBeNull();
            expect(session.completion_reason).toBeNull();
            expect(session.is_watching).toBe(false);
            expect(session.base_branch).toBeNull();
        });

        it('returns existing session for same branch (UNIQUE constraint)', async () => {
            const first = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const second = await service.getOrCreateSession(repoId, '/home/user/test-repo');

            expect(expectOk(first).id).toBe(expectOk(second).id);
        });

        it('creates separate sessions for different branches on same repo', async () => {
            const result1 = await service.getOrCreateSession(repoId, '/home/user/test-repo');

            // Change the mock to return a different branch
            (gitService.getCurrentBranch as any).mockReturnValue(okAsync('main'));

            const result2 = await service.getOrCreateSession(repoId, '/home/user/test-repo');

            const session1 = expectOk(result1);
            const session2 = expectOk(result2);
            expect(session1.id).not.toBe(session2.id);
            expect(session1.branch).toBe('feature/x');
            expect(session2.branch).toBe('main');
        });
    });

    describe('getSession', () => {
        it('returns SessionWithRepo with nested repo fields', async () => {
            const createResult = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const sessionId = expectOk(createResult).id;

            const result = service.getSession(sessionId);

            const sessionWithRepo = expectOk(result);
            expect(sessionWithRepo.id).toBe(sessionId);
            expect(sessionWithRepo.branch).toBe('feature/x');
            expect(sessionWithRepo.repo.name).toBe('test-repo');
            expect(sessionWithRepo.repo.remote_url).toBe('https://github.com/user/test.git');
            expect(sessionWithRepo.repo.base_branch).toBe('main');
            expect(sessionWithRepo.repo.path).toBe('/home/user/test-repo');
        });

        it('returns NOT_FOUND for nonexistent ID', () => {
            const result = service.getSession('nonexistent');

            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });
    });

    describe('updateBaseBranch', () => {
        it('updates base_branch field', async () => {
            const createResult = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const sessionId = expectOk(createResult).id;

            const result = service.updateBaseBranch(sessionId, 'develop');

            expect(expectOk(result).base_branch).toBe('develop');
        });

        it('returns NOT_FOUND for nonexistent ID', () => {
            const result = service.updateBaseBranch('nonexistent', 'develop');

            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });
    });

    describe('listSessions', () => {
        it('filters by repoId', async () => {
            // Create a second repo
            const repoId2 = generateId();
            dbService.execute("INSERT INTO repos (id, name, path, base_branch) VALUES ($id, 'repo2', $path, 'main')", {
                $id: repoId2,
                $path: '/home/user/repo2',
            });

            // Create sessions for both repos
            await service.getOrCreateSession(repoId, '/home/user/test-repo');

            (gitService.getCurrentBranch as any).mockReturnValue(okAsync('main'));
            await service.getOrCreateSession(repoId, '/home/user/test-repo');
            await service.getOrCreateSession(repoId2, '/home/user/repo2');

            const result = service.listSessions(repoId);
            expect(expectOk(result)).toHaveLength(2);
        });

        it('returns all when no filter', async () => {
            const repoId2 = generateId();
            dbService.execute("INSERT INTO repos (id, name, path, base_branch) VALUES ($id, 'repo2', $path, 'main')", {
                $id: repoId2,
                $path: '/home/user/repo2',
            });

            await service.getOrCreateSession(repoId, '/home/user/test-repo');

            (gitService.getCurrentBranch as any).mockReturnValue(okAsync('main'));
            await service.getOrCreateSession(repoId2, '/home/user/repo2');

            const result = service.listSessions();
            expect(expectOk(result)).toHaveLength(2);
        });

        it('returns empty array for empty DB', () => {
            const result = service.listSessions();
            expect(expectOk(result)).toEqual([]);
        });

        it('filters by status', async () => {
            const active = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const activeId = expectOk(active).id;

            const completed = service.completeSession(activeId, { force: true, reason: 'done' });
            expect(expectOk(completed).session.status).toBe('completed');

            const activeAfterComplete = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            expect(expectOk(activeAfterComplete).status).toBe('active');

            const activeList = service.listSessions(repoId, 'active');
            const completedList = service.listSessions(repoId, 'completed');

            expect(expectOk(activeList)).toHaveLength(1);
            expect(expectOk(completedList)).toHaveLength(1);
        });
    });

    describe('completeSession', () => {
        it('blocks completion when draft comments exist unless forced', async () => {
            const session = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const sessionId = expectOk(session).id;
            const snapshotId = generateId();

            dbService.execute(
                "INSERT INTO snapshots (id, session_id, raw_diff, files_summary, trigger) VALUES ($id, $sessionId, 'diff', '[]', 'manual')",
                { $id: snapshotId, $sessionId: sessionId },
            );
            dbService.execute(
                `INSERT INTO comments (id, session_id, snapshot_id, file_path, author, content, status)
                 VALUES ($id, $sessionId, $snapshotId, 'src/a.ts', 'user', 'draft comment', 'draft')`,
                { $id: generateId(), $sessionId: sessionId, $snapshotId: snapshotId },
            );

            const blocked = service.completeSession(sessionId, { force: false, reason: 'done' });
            expect(blocked.isOk()).toBe(true);
            expect(expectOk(blocked).blocked).toBe(true);
            expect(expectOk(blocked).summary.draft_count).toBe(1);

            const forced = service.completeSession(sessionId, { force: true, reason: 'done' });
            expect(forced.isOk()).toBe(true);
            expect(expectOk(forced).blocked).toBe(false);
            expect(expectOk(forced).session.status).toBe('completed');
            expect(expectOk(forced).session.completion_reason).toBe('done');
        });

        it('allows creating a new active session on same repo+branch after completion', async () => {
            const first = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const firstSession = expectOk(first);

            const completed = service.completeSession(firstSession.id, { force: true, reason: 'completed' });
            expect(expectOk(completed).session.status).toBe('completed');

            const second = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const secondSession = expectOk(second);

            expect(secondSession.id).not.toBe(firstSession.id);
            expect(secondSession.status).toBe('active');
        });
    });

    describe('is_watching casting', () => {
        it('casts is_watching from INTEGER to boolean in all methods', async () => {
            const createResult = await service.getOrCreateSession(repoId, '/home/user/test-repo');
            const session = expectOk(createResult);

            // getOrCreateSession
            expect(typeof session.is_watching).toBe('boolean');
            expect(session.is_watching).toBe(false);

            // getSession
            const getResult = service.getSession(session.id);
            expect(typeof expectOk(getResult).is_watching).toBe('boolean');

            // updateBaseBranch
            const updateResult = service.updateBaseBranch(session.id, 'develop');
            expect(typeof expectOk(updateResult).is_watching).toBe('boolean');

            // listSessions
            const listResult = service.listSessions();
            for (const s of expectOk(listResult)) {
                expect(typeof s.is_watching).toBe('boolean');
            }
        });
    });
});
