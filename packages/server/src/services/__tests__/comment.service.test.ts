import { generateId } from '@agent-code-reviewer/shared';
import { vi } from 'vitest';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initInMemoryDatabase } from '../../db/client.js';
import { DbService } from '../db.service.js';
import { CommentService } from '../comment.service.js';
import type { SseService } from '../sse.service.js';

describe('CommentService', () => {
    let dbService: DbService;
    let mockSse: SseService;
    let service: CommentService;
    let repoId: string;
    let sessionId: string;
    let snapA: string;
    let snapB: string;
    let snapC: string;

    beforeEach(async () => {
        const dbResult = await initInMemoryDatabase();
        expect(dbResult.isOk()).toBe(true);
        const db = expectOk(dbResult);
        dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });

        mockSse = {
            broadcast: vi.fn(),
            addConnection: vi.fn(),
            removeConnection: vi.fn(),
            getConnectionCount: vi.fn(),
            shutdown: vi.fn(),
        } as unknown as SseService;

        repoId = generateId();
        sessionId = generateId();
        snapA = generateId();
        snapB = generateId();
        snapC = generateId();

        dbService.execute(
            "INSERT INTO repos (id, name) VALUES ($id, 'test-repo')",
            { $id: repoId },
        );
        dbService.execute(
            "INSERT INTO sessions (id, repo_id, branch) VALUES ($id, $repoId, 'main')",
            { $id: sessionId, $repoId: repoId },
        );

        const filesSummaryA = JSON.stringify([
            { path: 'src/app.ts', status: 'modified', additions: 5, deletions: 2 },
            { path: 'src/old.ts', status: 'modified', additions: 1, deletions: 1 },
        ]);
        const filesSummaryB = JSON.stringify([
            { path: 'src/app.ts', status: 'modified', additions: 3, deletions: 1 },
            { path: 'src/new.ts', status: 'added', additions: 10, deletions: 0 },
        ]);
        const filesSummaryC = JSON.stringify([
            { path: 'src/app.ts', status: 'modified', additions: 2, deletions: 0 },
            { path: 'src/new.ts', status: 'modified', additions: 1, deletions: 1 },
            { path: 'src/extra.ts', status: 'added', additions: 20, deletions: 0 },
        ]);

        dbService.execute(
            "INSERT INTO snapshots (id, session_id, raw_diff, files_summary, trigger, created_at) VALUES ($id, $sessionId, 'diff-a', $files, 'manual', '2026-01-01 00:00:00')",
            { $id: snapA, $sessionId: sessionId, $files: filesSummaryA },
        );
        dbService.execute(
            "INSERT INTO snapshots (id, session_id, raw_diff, files_summary, trigger, created_at) VALUES ($id, $sessionId, 'diff-b', $files, 'manual', '2026-01-02 00:00:00')",
            { $id: snapB, $sessionId: sessionId, $files: filesSummaryB },
        );
        dbService.execute(
            "INSERT INTO snapshots (id, session_id, raw_diff, files_summary, trigger, created_at) VALUES ($id, $sessionId, 'diff-c', $files, 'manual', '2026-01-03 00:00:00')",
            { $id: snapC, $sessionId: sessionId, $files: filesSummaryC },
        );

        service = new CommentService(dbService, mockSse);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    describe('create', () => {
        it('inserts comment with correct fields', () => {
            const result = service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'This needs error handling',
            });

            const comment = expectOk(result);
            expect(comment.id).toBeTruthy();
            expect(comment.session_id).toBe(sessionId);
            expect(comment.snapshot_id).toBe(snapA);
            expect(comment.file_path).toBe('src/app.ts');
            expect(comment.content).toBe('This needs error handling');
            expect(comment.status).toBe('draft');
            expect(comment.author).toBe('user');
            expect(comment.reply_to_id).toBeNull();
            expect(comment.sent_at).toBeNull();
            expect(comment.resolved_at).toBeNull();
        });

        it('generates unique id', () => {
            const r1 = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Comment 1',
            }));
            const r2 = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Comment 2',
            }));

            expect(r1.id).not.toBe(r2.id);
        });

        it('defaults author to user', () => {
            const result = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));

            expect(result.author).toBe('user');
        });

        it('respects explicit author', () => {
            const result = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
                author: 'agent',
            }));

            expect(result.author).toBe('agent');
        });

        it('validates non-empty content', () => {
            const empty = service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: '',
            });
            const e1 = expectErr(empty);
            expect(e1.type).toBe('VALIDATION');
            expect(e1.message).toBe('Content must not be empty');

            const whitespace = service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: '   ',
            });
            const e2 = expectErr(whitespace);
            expect(e2.type).toBe('VALIDATION');
        });

        it('validates non-empty file_path', () => {
            const result = service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: '',
                content: 'Test',
            });
            const error = expectErr(result);
            expect(error.type).toBe('VALIDATION');
            expect(error.message).toBe('File path must not be empty');
        });

        it('validates snapshot_id exists', () => {
            const result = service.create({
                session_id: sessionId,
                snapshot_id: 'nonexistent',
                file_path: 'src/app.ts',
                content: 'Test',
            });
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
            expect(error.message).toBe('Snapshot not found');
        });

        it('broadcasts created SSE event', () => {
            const result = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));

            expect(mockSse.broadcast).toHaveBeenCalledWith(sessionId, {
                type: 'comment-update',
                data: { session_id: sessionId, comment_id: result.id, action: 'created' },
            });
        });

        it('stores optional fields', () => {
            const result = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
                line_start: 10,
                line_end: 15,
                side: 'new',
            }));

            expect(result.line_start).toBe(10);
            expect(result.line_end).toBe(15);
            expect(result.side).toBe('new');
        });

        it('handles null optional fields', () => {
            const result = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));

            expect(result.line_start).toBeNull();
            expect(result.line_end).toBeNull();
            expect(result.side).toBeNull();
        });
    });

    describe('update', () => {
        it('changes content of draft comment', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Original',
            }));

            const updated = expectOk(service.update(created.id, 'Updated'));
            expect(updated.content).toBe('Updated');
            expect(updated.id).toBe(created.id);
        });

        it('returns NotFoundError for missing id', () => {
            const result = service.update('nonexistent', 'x');
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });

        it('rejects sent comment', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));
            dbService.execute(
                "UPDATE comments SET status = 'sent' WHERE id = $id",
                { $id: created.id },
            );

            const result = service.update(created.id, 'New content');
            const error = expectErr(result);
            expect(error.type).toBe('VALIDATION');
            expect(error.message).toBe('Only draft comments can be edited');
        });

        it('rejects resolved comment', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));
            dbService.execute(
                "UPDATE comments SET status = 'resolved' WHERE id = $id",
                { $id: created.id },
            );

            const result = service.update(created.id, 'New content');
            const error = expectErr(result);
            expect(error.type).toBe('VALIDATION');
        });

        it('validates non-empty content', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));

            const result = service.update(created.id, '');
            const error = expectErr(result);
            expect(error.type).toBe('VALIDATION');
            expect(error.message).toBe('Content must not be empty');
        });

        it('broadcasts updated SSE event', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));
            vi.mocked(mockSse.broadcast).mockClear();

            expectOk(service.update(created.id, 'Updated'));

            expect(mockSse.broadcast).toHaveBeenCalledWith(sessionId, {
                type: 'comment-update',
                data: { session_id: sessionId, comment_id: created.id, action: 'updated' },
            });
        });
    });

    describe('delete', () => {
        it('removes draft comment', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));

            expectOk(service.delete(created.id));

            const check = dbService.queryOne<{ id: string }>(
                'SELECT id FROM comments WHERE id = $id',
                { $id: created.id },
            );
            expect(expectOk(check)).toBeUndefined();
        });

        it('returns NotFoundError for missing id', () => {
            const result = service.delete('nonexistent');
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });

        it('rejects sent comment', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));
            dbService.execute(
                "UPDATE comments SET status = 'sent' WHERE id = $id",
                { $id: created.id },
            );

            const result = service.delete(created.id);
            const error = expectErr(result);
            expect(error.type).toBe('VALIDATION');
            expect(error.message).toBe('Only draft comments can be deleted');
        });

        it('cascade deletes replies', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));
            const reply1 = expectOk(service.createReply(parent.id, 'Reply 1', 'user'));
            const reply2 = expectOk(service.createReply(parent.id, 'Reply 2', 'agent'));

            expectOk(service.delete(parent.id));

            for (const id of [parent.id, reply1.id, reply2.id]) {
                const check = dbService.queryOne<{ id: string }>(
                    'SELECT id FROM comments WHERE id = $id',
                    { $id: id },
                );
                expect(expectOk(check)).toBeUndefined();
            }
        });

        it('broadcasts deleted SSE event', () => {
            const created = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Test',
            }));
            vi.mocked(mockSse.broadcast).mockClear();

            expectOk(service.delete(created.id));

            expect(mockSse.broadcast).toHaveBeenCalledWith(sessionId, {
                type: 'comment-update',
                data: { session_id: sessionId, comment_id: created.id, action: 'deleted' },
            });
        });
    });

    describe('getCommentsByStatus', () => {
        it('returns filtered results', () => {
            for (let i = 0; i < 3; i++) {
                service.create({
                    session_id: sessionId,
                    snapshot_id: snapA,
                    file_path: 'src/app.ts',
                    content: `Draft ${i}`,
                });
            }
            for (let i = 0; i < 2; i++) {
                const c = expectOk(service.create({
                    session_id: sessionId,
                    snapshot_id: snapA,
                    file_path: 'src/app.ts',
                    content: `Sent ${i}`,
                }));
                dbService.execute(
                    "UPDATE comments SET status = 'sent' WHERE id = $id",
                    { $id: c.id },
                );
            }

            const drafts = expectOk(service.getCommentsByStatus(sessionId, 'draft'));
            expect(drafts).toHaveLength(3);
        });

        it('returns empty for no matches', () => {
            const result = expectOk(service.getCommentsByStatus(sessionId, 'resolved'));
            expect(result).toEqual([]);
        });

        it('filters by sessionId', () => {
            const sessionId2 = generateId();
            dbService.execute(
                "INSERT INTO sessions (id, repo_id, branch) VALUES ($id, $repoId, 'feature')",
                { $id: sessionId2, $repoId: repoId },
            );

            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Session 1',
            });
            service.create({
                session_id: sessionId2,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Session 2',
            });

            const result = expectOk(service.getCommentsByStatus(sessionId, 'draft'));
            expect(result).toHaveLength(1);
            expect(result[0].session_id).toBe(sessionId);
        });
    });

    describe('createReply', () => {
        it('creates reply with reply_to_id set', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));

            const reply = expectOk(service.createReply(parent.id, 'Reply text', 'user'));
            expect(reply.reply_to_id).toBe(parent.id);
        });

        it('inherits parent file_path, line_start, line_end, side', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                line_start: 10,
                line_end: 15,
                side: 'new',
                content: 'Parent',
            }));

            const reply = expectOk(service.createReply(parent.id, 'Reply', 'user'));
            expect(reply.file_path).toBe('src/app.ts');
            expect(reply.line_start).toBe(10);
            expect(reply.line_end).toBe(15);
            expect(reply.side).toBe('new');
        });

        it('inherits parent session_id, snapshot_id', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));

            const reply = expectOk(service.createReply(parent.id, 'Reply', 'user'));
            expect(reply.session_id).toBe(sessionId);
            expect(reply.snapshot_id).toBe(snapA);
        });

        it('accepts agent author', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));

            const reply = expectOk(service.createReply(parent.id, 'Agent reply', 'agent'));
            expect(reply.author).toBe('agent');
        });

        it('returns NotFoundError for missing parent', () => {
            const result = service.createReply('nonexistent', 'Reply', 'user');
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
            expect(error.message).toBe('Parent comment not found');
        });

        it('broadcasts created SSE event', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));
            vi.mocked(mockSse.broadcast).mockClear();

            const reply = expectOk(service.createReply(parent.id, 'Reply', 'user'));

            expect(mockSse.broadcast).toHaveBeenCalledWith(sessionId, {
                type: 'comment-update',
                data: { session_id: sessionId, comment_id: reply.id, action: 'created' },
            });
        });

        it('defaults status to draft', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));

            const reply = expectOk(service.createReply(parent.id, 'Reply', 'user'));
            expect(reply.status).toBe('draft');
        });
    });

    describe('getSessionComments', () => {
        it('returns threads with nested replies', () => {
            const parentA = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/a.ts',
                content: 'Parent A',
            }));
            const parentB = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/b.ts',
                content: 'Parent B',
            }));
            service.createReply(parentA.id, 'Reply A1', 'user');
            service.createReply(parentA.id, 'Reply A2', 'agent');
            service.createReply(parentB.id, 'Reply B1', 'user');

            const threads = expectOk(service.getSessionComments(sessionId));
            expect(threads).toHaveLength(2);

            const threadA = threads.find((t) => t.comment.id === parentA.id)!;
            const threadB = threads.find((t) => t.comment.id === parentB.id)!;
            expect(threadA.replies).toHaveLength(2);
            expect(threadB.replies).toHaveLength(1);
        });

        it('orders parents by file_path, line_start, created_at', () => {
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/z.ts',
                content: 'Z',
            });
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/a.ts',
                line_start: 20,
                content: 'A line 20',
            });
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/a.ts',
                line_start: 5,
                content: 'A line 5',
            });

            const threads = expectOk(service.getSessionComments(sessionId));
            expect(threads[0].comment.file_path).toBe('src/a.ts');
            expect(threads[0].comment.line_start).toBe(5);
            expect(threads[1].comment.file_path).toBe('src/a.ts');
            expect(threads[1].comment.line_start).toBe(20);
            expect(threads[2].comment.file_path).toBe('src/z.ts');
        });

        it('orders replies by created_at', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));

            const r1 = expectOk(service.createReply(parent.id, 'First', 'user'));
            const r2 = expectOk(service.createReply(parent.id, 'Second', 'agent'));
            const r3 = expectOk(service.createReply(parent.id, 'Third', 'user'));

            const threads = expectOk(service.getSessionComments(sessionId));
            expect(threads[0].replies.map((r) => r.id)).toEqual([r1.id, r2.id, r3.id]);
        });

        it('excludes orphan replies', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));
            service.createReply(parent.id, 'Reply', 'user');

            // Delete parent — cascade removes replies in DB, so orphan scenario
            // is actually handled by cascade. But let's test reply_to_id IS NULL filter directly.
            const threads = expectOk(service.getSessionComments(sessionId));
            // Only the parent shows as root thread, replies are nested
            expect(threads).toHaveLength(1);
            expect(threads[0].comment.reply_to_id).toBeNull();
        });

        it('returns empty for no comments', () => {
            const threads = expectOk(service.getSessionComments(sessionId));
            expect(threads).toEqual([]);
        });
    });

    describe('markSent', () => {
        it('transitions drafts to sent', () => {
            const c1 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C1' }));
            const c2 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C2' }));
            const c3 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C3' }));

            const result = expectOk(service.markSent([c1.id, c2.id, c3.id]));
            expect(result).toHaveLength(3);
            for (const c of result) {
                expect(c.status).toBe('sent');
            }
        });

        it('sets sent_at timestamp', () => {
            const c = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C' }));

            const result = expectOk(service.markSent([c.id]));
            expect(result[0].sent_at).toBeTruthy();
            expect(typeof result[0].sent_at).toBe('string');
        });

        it('updates has_review_comments on snapshots', () => {
            const c1 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C1' }));
            const c2 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapB, file_path: 'src/app.ts', content: 'C2' }));

            service.markSent([c1.id, c2.id]);

            const snapARow = expectOk(dbService.queryOne<{ has_review_comments: number }>(
                'SELECT has_review_comments FROM snapshots WHERE id = $id',
                { $id: snapA },
            ));
            const snapBRow = expectOk(dbService.queryOne<{ has_review_comments: number }>(
                'SELECT has_review_comments FROM snapshots WHERE id = $id',
                { $id: snapB },
            ));
            expect(snapARow!.has_review_comments).toBe(1);
            expect(snapBRow!.has_review_comments).toBe(1);
        });

        it('broadcasts SSE per comment', () => {
            const c1 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C1' }));
            const c2 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C2' }));
            vi.mocked(mockSse.broadcast).mockClear();

            service.markSent([c1.id, c2.id]);

            expect(mockSse.broadcast).toHaveBeenCalledTimes(2);
            expect(mockSse.broadcast).toHaveBeenCalledWith(sessionId, expect.objectContaining({
                type: 'comment-update',
                data: expect.objectContaining({ action: 'sent' }),
            }));
        });

        it('returns empty for empty array', () => {
            const result = expectOk(service.markSent([]));
            expect(result).toEqual([]);
            expect(mockSse.broadcast).not.toHaveBeenCalled();
        });

        it('skips non-draft comments', () => {
            const c1 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C1' }));
            const c2 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C2' }));
            const c3 = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C3' }));

            dbService.execute("UPDATE comments SET status = 'sent' WHERE id = $id", { $id: c3.id });
            vi.mocked(mockSse.broadcast).mockClear();

            const result = expectOk(service.markSent([c1.id, c2.id, c3.id]));
            expect(result).toHaveLength(2);
            expect(result.map((c) => c.id).sort()).toEqual([c1.id, c2.id].sort());
        });

        it('uses transaction', () => {
            const transactionSpy = vi.spyOn(dbService, 'transaction');

            const c = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C' }));
            service.markSent([c.id]);

            expect(transactionSpy).toHaveBeenCalled();
        });
    });

    describe('resolve', () => {
        it('transitions sent to resolved', () => {
            const c = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C' }));
            expectOk(service.markSent([c.id]));

            const resolved = expectOk(service.resolve(c.id));
            expect(resolved.status).toBe('resolved');
        });

        it('sets resolved_at timestamp', () => {
            const c = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C' }));
            expectOk(service.markSent([c.id]));

            const resolved = expectOk(service.resolve(c.id));
            expect(resolved.resolved_at).toBeTruthy();
            expect(typeof resolved.resolved_at).toBe('string');
        });

        it('rejects draft comment', () => {
            const c = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C' }));

            const result = service.resolve(c.id);
            const error = expectErr(result);
            expect(error.type).toBe('VALIDATION');
            expect(error.message).toBe('Cannot resolve draft comments, send first');
        });

        it('returns NotFoundError for missing id', () => {
            const result = service.resolve('nonexistent');
            const error = expectErr(result);
            expect(error.type).toBe('NOT_FOUND');
        });

        it('broadcasts resolved SSE event', () => {
            const c = expectOk(service.create({ session_id: sessionId, snapshot_id: snapA, file_path: 'src/app.ts', content: 'C' }));
            expectOk(service.markSent([c.id]));
            vi.mocked(mockSse.broadcast).mockClear();

            service.resolve(c.id);

            expect(mockSse.broadcast).toHaveBeenCalledWith(sessionId, {
                type: 'comment-update',
                data: { session_id: sessionId, comment_id: c.id, action: 'resolved' },
            });
        });
    });

    describe('getCommentsForSnapshot', () => {
        it('includes comments from earlier snapshots', () => {
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'On snap A, file exists in B',
            });

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(1);
            expect(threads[0].comment.file_path).toBe('src/app.ts');
        });

        it('includes comments from same snapshot', () => {
            const c = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapB,
                file_path: 'src/app.ts',
                content: 'On snap B',
            }));
            dbService.execute("UPDATE comments SET status = 'sent' WHERE id = $id", { $id: c.id });

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(1);
        });

        it('excludes comments from later snapshots', () => {
            service.create({
                session_id: sessionId,
                snapshot_id: snapC,
                file_path: 'src/app.ts',
                content: 'On snap C (later)',
            });

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(0);
        });

        it('excludes resolved comments', () => {
            const c = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Resolved',
            }));
            dbService.execute(
                "UPDATE comments SET status = 'resolved', resolved_at = datetime('now') WHERE id = $id",
                { $id: c.id },
            );

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(0);
        });

        it('excludes comments on files not in target snapshot', () => {
            // src/old.ts exists in A but not in B
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/old.ts',
                content: 'On old.ts',
            });

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(0);
        });

        it('includes session-level comments', () => {
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: '[general]',
                content: 'General comment',
            });

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(1);
            expect(threads[0].comment.file_path).toBe('[general]');
        });

        it('replies follow parent visibility', () => {
            const parent = expectOk(service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'Parent',
            }));
            service.createReply(parent.id, 'Reply 1', 'user');
            service.createReply(parent.id, 'Reply 2', 'agent');

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapB));
            expect(threads).toHaveLength(1);
            expect(threads[0].replies).toHaveLength(2);
        });

        it('returns only snap A comments when viewing A', () => {
            service.create({
                session_id: sessionId,
                snapshot_id: snapA,
                file_path: 'src/app.ts',
                content: 'On A',
            });
            service.create({
                session_id: sessionId,
                snapshot_id: snapB,
                file_path: 'src/app.ts',
                content: 'On B',
            });
            service.create({
                session_id: sessionId,
                snapshot_id: snapC,
                file_path: 'src/app.ts',
                content: 'On C',
            });

            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapA));
            expect(threads).toHaveLength(1);
            expect(threads[0].comment.content).toBe('On A');
        });

        it('returns empty for no applicable comments', () => {
            const threads = expectOk(service.getCommentsForSnapshot(sessionId, snapA));
            expect(threads).toEqual([]);
        });
    });
});
