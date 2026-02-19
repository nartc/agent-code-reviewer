import type { Comment, CommentThread } from '@agent-code-reviewer/shared';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '../services/api-client';
import { CommentStore } from './comment-store';

function makeComment(overrides: Partial<Comment> = {}): Comment {
    return {
        id: 'c1',
        session_id: 's1',
        snapshot_id: 'snap1',
        reply_to_id: null,
        file_path: 'a.ts',
        line_start: 1,
        line_end: 1,
        side: 'new',
        author: 'user',
        content: 'test',
        status: 'draft',
        created_at: '2025-01-01',
        sent_at: null,
        resolved_at: null,
        ...overrides,
    };
}

const threads: CommentThread[] = [
    { comment: makeComment({ id: 'c1', status: 'draft' }), replies: [] },
    { comment: makeComment({ id: 'c2', status: 'draft' }), replies: [] },
    { comment: makeComment({ id: 'c3', status: 'sent' }), replies: [] },
    { comment: makeComment({ id: 'c4', status: 'sent' }), replies: [] },
    { comment: makeComment({ id: 'c5', status: 'resolved' }), replies: [] },
];

describe('CommentStore', () => {
    let store: CommentStore;
    let apiSpy: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
        apiSpy = {
            listComments: vi.fn().mockReturnValue(of({ comments: threads })),
            createComment: vi.fn().mockReturnValue(of(makeComment({ id: 'c6' }))),
            updateComment: vi.fn().mockReturnValue(of(makeComment({ id: 'c1', content: 'updated' }))),
            deleteComment: vi.fn().mockReturnValue(of(undefined)),
            sendComments: vi
                .fn()
                .mockReturnValue(
                    of({
                        comments: [
                            makeComment({ id: 'c1', status: 'sent' }),
                            makeComment({ id: 'c2', status: 'sent' }),
                        ],
                    }),
                ),
            resolveComment: vi.fn().mockReturnValue(of(makeComment({ id: 'c1', status: 'resolved' }))),
            replyToComment: vi.fn().mockReturnValue(of(makeComment({ id: 'r1', reply_to_id: 'c1' }))),
        };

        TestBed.configureTestingModule({
            providers: [provideZonelessChangeDetection(), { provide: ApiClient, useValue: apiSpy }],
        });
        store = TestBed.inject(CommentStore);
    });

    function load() {
        store.loadComments({ session_id: 's1' });
    }

    it('loadComments sets comments and computed filters', () => {
        load();
        expect(store.comments().length).toBe(5);
        expect(store.draftComments().length).toBe(2);
        expect(store.sentComments().length).toBe(2);
        expect(store.resolvedComments().length).toBe(1);
    });

    it('createComment appends new thread', () => {
        load();
        store.createComment({ session_id: 's1', snapshot_id: 'snap1', file_path: 'b.ts', content: 'new' });
        expect(store.comments().length).toBe(6);
    });

    it('deleteComment removes parent thread', () => {
        load();
        store.deleteComment('c1');
        expect(store.comments().find((t) => t.comment.id === 'c1')).toBeUndefined();
    });

    it('sendComments updates status to sent', () => {
        load();
        store.sendComments({ comment_ids: ['c1', 'c2'], target_id: 't1', transport_type: 'tmux' });
        const c1 = store.comments().find((t) => t.comment.id === 'c1');
        const c2 = store.comments().find((t) => t.comment.id === 'c2');
        expect(c1?.comment.status).toBe('sent');
        expect(c2?.comment.status).toBe('sent');
    });

    it('createReply appends reply to correct thread', () => {
        load();
        store.createReply('c1', { content: 'reply text' });
        const thread = store.comments().find((t) => t.comment.id === 'c1');
        expect(thread?.replies.length).toBe(1);
    });

    it('onSseCommentUpdate is a no-op', () => {
        load();
        apiSpy['listComments'].mockClear();
        store.onSseCommentUpdate('s1');
        expect(apiSpy['listComments']).not.toHaveBeenCalled();
    });

    it('isLoading is set correctly during load', () => {
        expect(store.isLoading()).toBe(false);
        store.loadComments({ session_id: 's1' });
        expect(store.isLoading()).toBe(false);
    });

    it('createComment calls onCreated callback', () => {
        load();
        const callback = vi.fn();
        store.createComment({ session_id: 's1', snapshot_id: 'snap1', file_path: 'b.ts', content: 'new' }, callback);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'c6' }));
    });
});
