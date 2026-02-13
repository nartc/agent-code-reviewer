import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CommentStore } from './comment-store';
import { ApiClient } from '../services/api-client';
import type { CommentThread, Comment } from '@agent-code-reviewer/shared';

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
            createComment: vi.fn().mockReturnValue(of({ comment: makeComment({ id: 'c6' }) })),
            updateComment: vi.fn().mockReturnValue(of({ comment: makeComment({ id: 'c1', content: 'updated' }) })),
            deleteComment: vi.fn().mockReturnValue(of(undefined)),
            sendComments: vi.fn().mockReturnValue(of({ comments: [makeComment({ id: 'c1', status: 'sent' }), makeComment({ id: 'c2', status: 'sent' })] })),
            resolveComment: vi.fn().mockReturnValue(of({ comment: makeComment({ id: 'c1', status: 'resolved' }) })),
            replyToComment: vi.fn().mockReturnValue(of({ comment: makeComment({ id: 'r1', reply_to_id: 'c1' }) })),
        };

        TestBed.configureTestingModule({
            providers: [{ provide: ApiClient, useValue: apiSpy }],
        });
        store = TestBed.inject(CommentStore);
    });

    it('loadComments sets comments and computed filters', () => {
        store.loadComments({ session_id: 's1' });
        expect(store.comments().length).toBe(5);
        expect(store.draftComments().length).toBe(2);
        expect(store.sentComments().length).toBe(2);
        expect(store.resolvedComments().length).toBe(1);
    });

    it('createComment appends new thread', () => {
        store.loadComments({ session_id: 's1' });
        store.createComment({ session_id: 's1', snapshot_id: 'snap1', file_path: 'b.ts', content: 'new' });
        expect(store.comments().length).toBe(6);
    });

    it('deleteComment removes parent thread', () => {
        store.loadComments({ session_id: 's1' });
        store.deleteComment('c1');
        expect(store.comments().find((t) => t.comment.id === 'c1')).toBeUndefined();
    });

    it('sendComments updates status to sent', () => {
        store.loadComments({ session_id: 's1' });
        store.sendComments({ comment_ids: ['c1', 'c2'], target_id: 't1', transport_type: 'tmux' });
        const c1 = store.comments().find((t) => t.comment.id === 'c1');
        const c2 = store.comments().find((t) => t.comment.id === 'c2');
        expect(c1?.comment.status).toBe('sent');
        expect(c2?.comment.status).toBe('sent');
    });

    it('createReply appends reply to correct thread', () => {
        store.loadComments({ session_id: 's1' });
        store.createReply('c1', { content: 'reply text' });
        const thread = store.comments().find((t) => t.comment.id === 'c1');
        expect(thread?.replies.length).toBe(1);
    });

    it('onSseCommentUpdate calls loadComments', () => {
        store.onSseCommentUpdate('s1');
        expect(apiSpy['listComments']).toHaveBeenCalledWith({ session_id: 's1' });
    });

    it('isLoading is set correctly during load', () => {
        expect(store.isLoading()).toBe(false);
        store.loadComments({ session_id: 's1' });
        // After subscribe resolves synchronously with of(), isLoading is false again
        expect(store.isLoading()).toBe(false);
    });
});
