import type { Hono } from 'hono';
import { okAsync } from 'neverthrow';
import { vi } from 'vitest';
import { createApp } from '../app.js';
import { initInMemoryDatabase } from '../db/client.js';
import { CommentService } from '../services/comment.service.js';
import { DbService } from '../services/db.service.js';
import { GitService } from '../services/git.service.js';
import { RepoService } from '../services/repo.service.js';
import { SessionService } from '../services/session.service.js';
import { SseService } from '../services/sse.service.js';
import { TransportService } from '../services/transport.service.js';
import type { WatcherService } from '../services/watcher.service.js';
import type { Transport } from '../transport/transport.interface.js';
import { expectOk } from './helpers.js';

function createMockSseService(): SseService {
    return {
        addConnection: vi.fn(),
        removeConnection: vi.fn(),
        broadcast: vi.fn(),
        getConnectionCount: vi.fn().mockReturnValue(0),
        shutdown: vi.fn(),
    } as unknown as SseService;
}

let app: Hono;
let dbService: DbService;
let gitService: GitService;
let mockTransport: Transport;
let sseService: SseService;
let snapCounter = 0;

beforeEach(async () => {
    const result = await initInMemoryDatabase();
    const db = expectOk(result);
    dbService = new DbService(db, '/tmp/test-routes.db', {
        autoSave: false,
        shutdownHooks: false,
    });

    gitService = {
        isGitRepo: vi.fn().mockReturnValue(okAsync(true)),
        getRemoteUrl: vi.fn().mockReturnValue(okAsync('https://github.com/test/repo.git')),
        getCurrentBranch: vi.fn().mockReturnValue(okAsync('feature-branch')),
        getDefaultBranch: vi.fn().mockReturnValue(okAsync('main')),
        getHeadCommit: vi.fn().mockReturnValue(okAsync('abc123')),
        getDiff: vi.fn().mockReturnValue(okAsync({ rawDiff: 'diff --git a/file.ts b/file.ts', files: [] })),
        listBranches: vi.fn().mockReturnValue(okAsync(['main', 'develop'])),
        getInfo: vi.fn().mockReturnValue(
            okAsync({
                remoteUrl: 'https://github.com/test/repo.git',
                currentBranch: 'main',
                defaultBranch: 'main',
                headCommit: 'abc123',
            }),
        ),
        scanForRepos: vi.fn(),
    } as unknown as GitService;

    sseService = createMockSseService();
    const repoService = new RepoService(dbService, gitService);
    const sessionService = new SessionService(dbService, gitService);
    const commentService = new CommentService(dbService, sseService);

    const watcherService = {
        startWatching: vi.fn().mockReturnValue(okAsync(undefined)),
        stopWatching: vi.fn().mockReturnValue(okAsync(undefined)),
        captureSnapshot: vi.fn().mockImplementation((sessionId: string, _repoPath: string, trigger: string) => {
            // Insert a snapshot into the DB and return it
            const id = `snap-${Date.now()}-${++snapCounter}`;
            dbService.execute(
                `INSERT INTO snapshots (id, session_id, raw_diff, files_summary, head_commit, trigger, has_review_comments)
                 VALUES ($id, $sessionId, $rawDiff, $filesSummary, $headCommit, $trigger, 0)`,
                {
                    $id: id,
                    $sessionId: sessionId,
                    $rawDiff: 'diff --git a/file.ts',
                    $filesSummary: JSON.stringify([]),
                    $headCommit: 'abc123',
                    $trigger: trigger,
                },
            );
            const row = dbService.queryOne<any>('SELECT * FROM snapshots WHERE id = $id', { $id: id });
            if (row.isErr()) return okAsync(null);
            const snapshot = row.value;
            return okAsync({
                ...snapshot,
                files_summary: JSON.parse(snapshot.files_summary),
                changed_files: snapshot.changed_files ? JSON.parse(snapshot.changed_files) : null,
                has_review_comments: !!snapshot.has_review_comments,
            });
        }),
        isWatching: vi.fn().mockReturnValue(false),
        stopAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as WatcherService;

    mockTransport = {
        type: 'clipboard',
        isAvailable: vi.fn().mockReturnValue(okAsync(true)),
        listTargets: vi.fn().mockReturnValue(okAsync([])),
        sendComments: vi
            .fn()
            .mockReturnValue(okAsync({ success: true, formatted_text: '## Code Review Comments\n\ntest' })),
        getStatus: vi.fn().mockReturnValue(okAsync({ type: 'clipboard', available: true })),
    } as unknown as Transport;
    const transportService = new TransportService([mockTransport], dbService);

    app = createApp({
        dbService,
        sseService,
        watcherService,
        repoService,
        sessionService,
        commentService,
        transportService,
        gitService,
        config: { port: 3847, dbPath: ':memory:', scanRoots: ['/tmp'], scanMaxDepth: 2 },
    });
});

afterEach(() => {
    try {
        dbService.close();
    } catch {
        // ignore
    }
});

describe('Repo Routes', () => {
    it('POST /api/repos → 201 with is_new: true', async () => {
        const res = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as any;
        expect(body.is_new).toBe(true);
        expect(body.repo).toBeDefined();
        expect(body.repo_path).toBeDefined();
    });

    it('POST same path again → 200 with is_new: false', async () => {
        await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });

        const res = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.is_new).toBe(false);
    });

    it('GET /api/repos → 200 with repos array', async () => {
        await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });

        const res = await app.request('/api/repos');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.repos).toBeInstanceOf(Array);
        expect(body.repos.length).toBe(1);
    });

    it('PATCH /api/repos/:id → 200 with updated repo', async () => {
        const createRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const created = (await createRes.json()) as any;

        const res = await app.request(`/api/repos/${created.repo.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_branch: 'develop' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.base_branch).toBe('develop');
    });

    it('DELETE /api/repos/:id → 204', async () => {
        const createRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const created = (await createRes.json()) as any;

        const res = await app.request(`/api/repos/${created.repo.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(204);
    });

    it('GET /api/repos after delete → empty array', async () => {
        const createRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const created = (await createRes.json()) as any;

        await app.request(`/api/repos/${created.repo.id}`, { method: 'DELETE' });

        const res = await app.request('/api/repos');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.repos).toEqual([]);
    });

    it('PATCH /api/repos/nonexistent → 404', async () => {
        const res = await app.request('/api/repos/nonexistent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_branch: 'develop' }),
        });
        expect(res.status).toBe(404);
    });

    it('DELETE /api/repos/nonexistent → 404', async () => {
        const res = await app.request('/api/repos/nonexistent', {
            method: 'DELETE',
        });
        expect(res.status).toBe(404);
    });

    it('POST /api/repos with empty path → 400', async () => {
        const res = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '' }),
        });
        expect(res.status).toBe(400);
    });
});

describe('Session Routes', () => {
    let repoId: string;

    beforeEach(async () => {
        const createRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const created = (await createRes.json()) as any;
        repoId = created.repo.id;
    });

    it('POST /api/sessions → 201 with session and snapshot', async () => {
        const res = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repoId, path: '/test/repo' }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as any;
        expect(body.session).toBeDefined();
        expect(body.snapshot).toBeDefined();
    });

    it('GET /api/sessions/:id → 200 with SessionWithRepo', async () => {
        const createRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repoId, path: '/test/repo' }),
        });
        const created = (await createRes.json()) as any;

        const res = await app.request(`/api/sessions/${created.session.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.repo).toBeDefined();
        expect(body.repo_path).toBeDefined();
    });

    it('PATCH /api/sessions/:id → 200', async () => {
        const createRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repoId, path: '/test/repo' }),
        });
        const created = (await createRes.json()) as any;

        const res = await app.request(`/api/sessions/${created.session.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_branch: 'develop' }),
        });
        expect(res.status).toBe(200);
    });

    it('GET /api/sessions/nonexistent → 404', async () => {
        const res = await app.request('/api/sessions/nonexistent');
        expect(res.status).toBe(404);
    });
});

describe('Snapshot Routes', () => {
    let sessionId: string;
    let snapshotId: string;

    beforeEach(async () => {
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const repo = (await repoRes.json()) as any;

        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repo.repo.id, path: '/test/repo' }),
        });
        const session = (await sessionRes.json()) as any;
        sessionId = session.session.id;
        snapshotId = session.snapshot.id;
    });

    it('GET /api/sessions/:id/snapshots → 200 with snapshots array, no raw_diff', async () => {
        const res = await app.request(`/api/sessions/${sessionId}/snapshots`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.snapshots).toBeInstanceOf(Array);
        expect(body.snapshots.length).toBeGreaterThanOrEqual(1);
        expect(body.snapshots[0].raw_diff).toBeUndefined();
    });

    it('GET /api/sessions/:id/snapshots?limit=1 → max 1 result', async () => {
        const res = await app.request(`/api/sessions/${sessionId}/snapshots?limit=1`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.snapshots.length).toBeLessThanOrEqual(1);
    });

    it('GET /api/snapshots/:id/diff → 200 with full snapshot', async () => {
        const res = await app.request(`/api/snapshots/${snapshotId}/diff`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.snapshot).toBeDefined();
        expect(body.snapshot.raw_diff).toBeDefined();
    });

    it('GET /api/snapshots/nonexistent/diff → 404', async () => {
        const res = await app.request('/api/snapshots/nonexistent/diff');
        expect(res.status).toBe(404);
    });
});

describe('Comment Routes', () => {
    let sessionId: string;
    let snapshotId: string;

    beforeEach(async () => {
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const repo = (await repoRes.json()) as any;

        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repo.repo.id, path: '/test/repo' }),
        });
        const session = (await sessionRes.json()) as any;
        sessionId = session.session.id;
        snapshotId = session.snapshot.id;
    });

    it('POST /api/comments → 201 with draft comment', async () => {
        const res = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Consider using const here',
            }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as any;
        expect(body.status).toBe('draft');
    });

    it('PATCH /api/comments/:id → 200 with updated content', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Original',
            }),
        });
        const created = (await createRes.json()) as any;

        const res = await app.request(`/api/comments/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'Updated' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.content).toBe('Updated');
    });

    it('GET /api/comments?session_id=x → 200 with threads', async () => {
        await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Test comment',
            }),
        });

        const res = await app.request(`/api/comments?session_id=${sessionId}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.comments).toBeInstanceOf(Array);
        expect(body.comments.length).toBe(1);
        expect(body.comments[0].comment).toBeDefined();
        expect(body.comments[0].replies).toBeInstanceOf(Array);
    });

    it('POST /api/comments/send → marks sent and calls transport', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Send me',
            }),
        });
        const comment = (await createRes.json()) as any;

        const res = await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [comment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.comments).toBeInstanceOf(Array);
        expect(body.comments[0].status).toBe('sent');
        expect(body.formatted_text).toBeDefined();
    });

    it('POST /api/comments/:id/resolve → 200 with resolved comment', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Resolve me',
            }),
        });
        const comment = (await createRes.json()) as any;

        // Mark sent first
        await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [comment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });

        const res = await app.request(`/api/comments/${comment.id}/resolve`, {
            method: 'POST',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.status).toBe('resolved');
    });

    it('POST /api/comments/:id/reply → 201 with reply', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Parent',
            }),
        });
        const parent = (await createRes.json()) as any;

        const res = await app.request(`/api/comments/${parent.id}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'Reply to parent' }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as any;
        expect(body.reply_to_id).toBe(parent.id);
        expect(body.author).toBe('user');
    });

    it('DELETE /api/comments/:id (draft) → 204', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Delete me',
            }),
        });
        const comment = (await createRes.json()) as any;

        const res = await app.request(`/api/comments/${comment.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(204);
    });
});

describe('Error Responses', () => {
    it('404 returns standard error shape', async () => {
        const res = await app.request('/api/repos/nonexistent', {
            method: 'DELETE',
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBeDefined();
    });

    it('400 for Zod validation failures', async () => {
        const res = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '' }),
        });
        expect(res.status).toBe(400);
    });
});

describe('Transport Routes', () => {
    it('GET /api/transport/status → 200 with statuses array', async () => {
        const res = await app.request('/api/transport/status');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.statuses).toBeInstanceOf(Array);
        expect(body.statuses.length).toBeGreaterThanOrEqual(1);
        expect(body.statuses[0].type).toBe('clipboard');
        expect(body.statuses[0].available).toBe(true);
    });

    it('GET /api/transport/targets → 200 with targets array', async () => {
        const res = await app.request('/api/transport/targets');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.targets).toBeInstanceOf(Array);
    });

    it('GET /api/transport/config → 200 with default config', async () => {
        const res = await app.request('/api/transport/config');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body).toBeDefined();
    });

    it('PUT /api/transport/config → 200, then GET confirms persistence', async () => {
        const putRes = await app.request('/api/transport/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active_transport: 'clipboard', last_target_id: 'tgt-1' }),
        });
        expect(putRes.status).toBe(200);

        const getRes = await app.request('/api/transport/config');
        expect(getRes.status).toBe(200);
        const body = (await getRes.json()) as any;
        expect(body.active_transport).toBe('clipboard');
        expect(body.last_target_id).toBe('tgt-1');
    });

    it('PUT /api/transport/config with empty body → 400', async () => {
        const res = await app.request('/api/transport/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });
});

describe('Git Routes', () => {
    it('GET /api/git/info?path=/test → 200 with snake_case keys', async () => {
        const res = await app.request('/api/git/info?path=/test');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.is_git_repo).toBe(true);
        expect(body.remote_url).toBe('https://github.com/test/repo.git');
        expect(body.current_branch).toBe('main');
        expect(body.default_branch).toBe('main');
        expect(body.repo_name).toBeDefined();
    });

    it('GET /api/git/branches?path=/test → 200 with branches array', async () => {
        const res = await app.request('/api/git/branches?path=/test');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.branches).toBeInstanceOf(Array);
        expect(body.branches).toContain('main');
        expect(body.branches).toContain('develop');
    });

    it('GET /api/git/info (no path) → 400', async () => {
        const res = await app.request('/api/git/info');
        expect(res.status).toBe(400);
    });

    it('GET /api/git/branches (no path) → 400', async () => {
        const res = await app.request('/api/git/branches');
        expect(res.status).toBe(400);
    });
});

describe('Watch Routes', () => {
    let sessionId: string;

    beforeEach(async () => {
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const repo = (await repoRes.json()) as any;

        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repo.repo.id, path: '/test/repo' }),
        });
        const session = (await sessionRes.json()) as any;
        sessionId = session.session.id;
    });

    it('POST /api/sessions/:id/watch → 200', async () => {
        const res = await app.request(`/api/sessions/${sessionId}/watch`, {
            method: 'POST',
        });
        expect(res.status).toBe(200);
    });

    it('DELETE /api/sessions/:id/watch → 200', async () => {
        const res = await app.request(`/api/sessions/${sessionId}/watch`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(200);
    });

    it('POST /api/sessions/nonexistent/watch → 404', async () => {
        const res = await app.request('/api/sessions/nonexistent/watch', {
            method: 'POST',
        });
        expect(res.status).toBe(404);
    });

    it('DELETE /api/sessions/nonexistent/watch → 200 (silent success)', async () => {
        const res = await app.request('/api/sessions/nonexistent/watch', {
            method: 'DELETE',
        });
        expect(res.status).toBe(200);
    });
});

describe('Comment Routes — error paths', () => {
    let sessionId: string;
    let snapshotId: string;

    beforeEach(async () => {
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const repo = (await repoRes.json()) as any;

        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repo.repo.id, path: '/test/repo' }),
        });
        const session = (await sessionRes.json()) as any;
        sessionId = session.session.id;
        snapshotId = session.snapshot.id;
    });

    it('PATCH /api/comments/nonexistent → 404', async () => {
        const res = await app.request('/api/comments/nonexistent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'x' }),
        });
        expect(res.status).toBe(404);
        const body = (await res.json()) as any;
        expect(body.error.code).toBe('NOT_FOUND');
    });

    it('DELETE /api/comments/nonexistent → 404', async () => {
        const res = await app.request('/api/comments/nonexistent', {
            method: 'DELETE',
        });
        expect(res.status).toBe(404);
    });

    it('POST /api/comments/nonexistent/resolve → 404', async () => {
        const res = await app.request('/api/comments/nonexistent/resolve', {
            method: 'POST',
        });
        expect(res.status).toBe(404);
    });

    it('POST /api/comments/nonexistent/reply → 404', async () => {
        const res = await app.request('/api/comments/nonexistent/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'x' }),
        });
        expect(res.status).toBe(404);
    });

    it('Edit sent comment → 400', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Will be sent',
            }),
        });
        const comment = (await createRes.json()) as any;

        await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [comment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });

        const res = await app.request(`/api/comments/${comment.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'new' }),
        });
        expect(res.status).toBe(400);
    });

    it('Delete sent comment → 400', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Will be sent then deleted',
            }),
        });
        const comment = (await createRes.json()) as any;

        await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [comment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });

        const res = await app.request(`/api/comments/${comment.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(400);
    });

    it('Resolve draft comment → 400', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Draft only',
            }),
        });
        const comment = (await createRes.json()) as any;

        const res = await app.request(`/api/comments/${comment.id}/resolve`, {
            method: 'POST',
        });
        expect(res.status).toBe(400);
    });

    it('Create comment with empty content → 400', async () => {
        const res = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'f.ts',
                content: '',
            }),
        });
        expect(res.status).toBe(400);
    });

    it('Create comment with missing session_id → 400', async () => {
        const res = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                snapshot_id: snapshotId,
                file_path: 'f.ts',
                content: 'x',
            }),
        });
        expect(res.status).toBe(400);
    });

    it('GET /api/comments?session_id=x&snapshot_id=y → roll-forward query', async () => {
        // Create comment on the initial snapshot
        await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Comment on snapshot A',
            }),
        });

        // Capture a second snapshot
        const snapRes = await app.request(`/api/sessions/${sessionId}/snapshots`, {
            method: 'POST',
        });
        expect(snapRes.status).toBe(201);
        const snap2 = (await snapRes.json()) as any;

        // Query with the second snapshot's ID — should include comment from first snapshot via roll-forward
        const res = await app.request(`/api/comments?session_id=${sessionId}&snapshot_id=${snap2.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.comments).toBeInstanceOf(Array);
    });

    it('GET /api/comments?session_id=x&status=draft → status filter', async () => {
        // Create a draft comment
        await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Draft comment',
            }),
        });

        // Create and send another comment
        const sentRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Sent comment',
            }),
        });
        const sentComment = (await sentRes.json()) as any;
        await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [sentComment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });

        const res = await app.request(`/api/comments?session_id=${sessionId}&status=draft`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.comments).toBeInstanceOf(Array);
        expect(body.comments.length).toBe(1);
        expect(body.comments[0].comment.status).toBe('draft');
    });
});

describe('Session Routes — error paths', () => {
    it('POST /api/sessions with nonexistent repo_id → 500 (FK violation)', async () => {
        const res = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: 'nonexistent-repo-id', path: '/test' }),
        });
        // FK constraint violation is not suppressible by OR IGNORE in SQLite,
        // so the database error propagates as 500
        expect(res.status).toBe(500);
    });

    it('PATCH /api/sessions/nonexistent → 404', async () => {
        const res = await app.request('/api/sessions/nonexistent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_branch: 'dev' }),
        });
        expect(res.status).toBe(404);
    });
});

describe('Snapshot Routes — manual capture', () => {
    let sessionId: string;

    beforeEach(async () => {
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const repo = (await repoRes.json()) as any;

        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repo.repo.id, path: '/test/repo' }),
        });
        const session = (await sessionRes.json()) as any;
        sessionId = session.session.id;
    });

    it('POST /api/sessions/:id/snapshots (manual capture) → 201', async () => {
        const res = await app.request(`/api/sessions/${sessionId}/snapshots`, {
            method: 'POST',
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as any;
        expect(body.trigger).toBeDefined();
    });

    it('After initial + manual → 2 snapshots', async () => {
        await app.request(`/api/sessions/${sessionId}/snapshots`, {
            method: 'POST',
        });

        const res = await app.request(`/api/sessions/${sessionId}/snapshots`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.snapshots.length).toBe(2);
    });

    it('POST /api/sessions/nonexistent/snapshots → 404', async () => {
        const res = await app.request('/api/sessions/nonexistent/snapshots', {
            method: 'POST',
        });
        expect(res.status).toBe(404);
    });
});

describe('SSE Broadcast Verification', () => {
    let sessionId: string;
    let snapshotId: string;

    beforeEach(async () => {
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        const repo = (await repoRes.json()) as any;

        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repo.repo.id, path: '/test/repo' }),
        });
        const session = (await sessionRes.json()) as any;
        sessionId = session.session.id;
        snapshotId = session.snapshot.id;
    });

    it('Broadcast after send', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Broadcast test',
            }),
        });
        const comment = (await createRes.json()) as any;

        await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [comment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });

        expect(sseService.broadcast).toHaveBeenCalledWith(
            sessionId,
            expect.objectContaining({
                type: 'comment-update',
                data: expect.objectContaining({ action: 'sent' }),
            }),
        );
    });

    it('Broadcast after resolve', async () => {
        const createRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Resolve broadcast test',
            }),
        });
        const comment = (await createRes.json()) as any;

        await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [comment.id],
                target_id: 'test-target',
                transport_type: 'clipboard',
            }),
        });

        await app.request(`/api/comments/${comment.id}/resolve`, {
            method: 'POST',
        });

        expect(sseService.broadcast).toHaveBeenCalledWith(
            sessionId,
            expect.objectContaining({
                type: 'comment-update',
                data: expect.objectContaining({ action: 'resolved' }),
            }),
        );
    });
});

describe('Full Lifecycle Flow', () => {
    it('chains repo → session → watch → snapshot → comment → send → resolve → cleanup', async () => {
        // 1. Create repo
        const repoRes = await app.request('/api/repos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/test/repo' }),
        });
        expect(repoRes.status).toBe(201);
        const repoBody = (await repoRes.json()) as any;
        const repoId = repoBody.repo.id;

        // 2. Create session (captures initial snapshot)
        const sessionRes = await app.request('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_id: repoId, path: '/test/repo' }),
        });
        expect(sessionRes.status).toBe(201);
        const sessionBody = (await sessionRes.json()) as any;
        const sessionId = sessionBody.session.id;
        const snapshotId = sessionBody.snapshot.id;

        // 3. Start watching
        const watchRes = await app.request(`/api/sessions/${sessionId}/watch`, {
            method: 'POST',
        });
        expect(watchRes.status).toBe(200);

        // 4. Manual snapshot capture
        const snap2Res = await app.request(`/api/sessions/${sessionId}/snapshots`, {
            method: 'POST',
        });
        expect(snap2Res.status).toBe(201);

        // 5. Verify 2 snapshots
        const snapshotsRes = await app.request(`/api/sessions/${sessionId}/snapshots`);
        expect(snapshotsRes.status).toBe(200);
        const snapshotsBody = (await snapshotsRes.json()) as any;
        expect(snapshotsBody.snapshots.length).toBe(2);

        // 6. Create comment
        const commentRes = await app.request('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                snapshot_id: snapshotId,
                file_path: 'src/app.ts',
                content: 'Review comment',
            }),
        });
        expect(commentRes.status).toBe(201);
        const commentBody = (await commentRes.json()) as any;
        const commentId = commentBody.id;

        // 7. Reply to comment
        const replyRes = await app.request(`/api/comments/${commentId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'Reply text' }),
        });
        expect(replyRes.status).toBe(201);

        // 8. Verify thread structure
        const threadsRes = await app.request(`/api/comments?session_id=${sessionId}`);
        expect(threadsRes.status).toBe(200);
        const threadsBody = (await threadsRes.json()) as any;
        expect(threadsBody.comments.length).toBe(1);
        expect(threadsBody.comments[0].replies.length).toBe(1);

        // 9. Send comment
        const sendRes = await app.request('/api/comments/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comment_ids: [commentId],
                target_id: 'tgt',
                transport_type: 'clipboard',
            }),
        });
        expect(sendRes.status).toBe(200);
        const sendBody = (await sendRes.json()) as any;
        expect(sendBody.comments[0].status).toBe('sent');
        expect(sendBody.formatted_text).toBeDefined();

        // 10. Resolve comment
        const resolveRes = await app.request(`/api/comments/${commentId}/resolve`, {
            method: 'POST',
        });
        expect(resolveRes.status).toBe(200);
        const resolveBody = (await resolveRes.json()) as any;
        expect(resolveBody.status).toBe('resolved');

        // 11. Stop watching
        const unwatchRes = await app.request(`/api/sessions/${sessionId}/watch`, {
            method: 'DELETE',
        });
        expect(unwatchRes.status).toBe(200);

        // 12. Delete repo
        const deleteRes = await app.request(`/api/repos/${repoId}`, {
            method: 'DELETE',
        });
        expect(deleteRes.status).toBe(204);

        // 13. Verify empty
        const listRes = await app.request('/api/repos');
        expect(listRes.status).toBe(200);
        const listBody = (await listRes.json()) as any;
        expect(listBody.repos.length).toBe(0);
    });
});
