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
    let repoPathId: string;

    beforeEach(async () => {
        const dbResult = await initInMemoryDatabase();
        expect(dbResult.isOk()).toBe(true);
        const db = expectOk(dbResult);
        dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });
        gitService = createMockGitService();
        service = new SessionService(dbService, gitService);

        // Seed a repo and repo_path for FK constraints
        repoId = generateId();
        repoPathId = generateId();
        dbService.execute("INSERT INTO repos (id, remote_url, name, base_branch) VALUES ($id, $url, $name, 'main')", {
            $id: repoId,
            $url: 'https://github.com/user/test.git',
            $name: 'test-repo',
        });
        dbService.execute('INSERT INTO repo_paths (id, repo_id, path) VALUES ($id, $repoId, $path)', {
            $id: repoPathId,
            $repoId: repoId,
            $path: '/home/user/test-repo',
        });
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
            expect(sessionWithRepo.repo_path.path).toBe('/home/user/test-repo');
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
            dbService.execute("INSERT INTO repos (id, name, base_branch) VALUES ($id, 'repo2', 'main')", {
                $id: repoId2,
            });
            dbService.execute('INSERT INTO repo_paths (id, repo_id, path) VALUES ($id, $repoId, $path)', {
                $id: generateId(),
                $repoId: repoId2,
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
            dbService.execute("INSERT INTO repos (id, name, base_branch) VALUES ($id, 'repo2', 'main')", {
                $id: repoId2,
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
