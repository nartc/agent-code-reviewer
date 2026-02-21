import type { CommentThread, TransportType } from '@agent-code-reviewer/shared';
import { Component, CUSTOM_ELEMENTS_SCHEMA, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { CommentStore } from '../../core/stores/comment-store';
import { SessionStore } from '../../core/stores/session-store';
import { TransportStore } from '../../core/stores/transport-store';
import { Review } from './review';

@Component({
    imports: [Review],
    template: `<acr-review [sessionId]="'s1'" />`,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class TestHost {
    review = viewChild.required(Review);
}

describe('Review — send flow', () => {
    let fixture: ComponentFixture<TestHost>;
    let review: Review;
    let sendCommentsSpy: ReturnType<typeof vi.fn>;
    let activeTransport: TransportType | null;
    let lastTargetId: string | null;

    beforeEach(async () => {
        activeTransport = 'tmux';
        lastTargetId = 'pane-1';
        sendCommentsSpy = vi.fn();

        const mockTransportStore = {
            activeTransport: () => activeTransport,
            lastTargetId: () => lastTargetId,
        } as unknown as TransportStore;

        const mockCommentStore = {
            draftComments: () => [] as CommentThread[],
            sentComments: () => [] as CommentThread[],
            resolvedComments: () => [] as CommentThread[],
            loadComments: vi.fn(),
            sendComments: sendCommentsSpy,
        } as unknown as CommentStore;

        const mockSessionStore = {
            currentSession: () => ({
                id: 's1',
                repo: { name: 'test-repo' },
                branch: 'main',
                repo_path: { path: '/test' },
                repo_id: 'r1',
            }),
            isConnected: () => true,
            isWatching: () => false,
            snapshots: () => [],
            activeSnapshotId: () => 'snap1',
            hasNewChanges: () => false,
            files: () => [],
            activeFileIndex: () => -1,
            sessionError: () => null,
            loadSession: vi.fn(),
            setActiveSnapshot: vi.fn(),
            jumpToLatest: vi.fn(),
            setActiveFile: vi.fn(),
        } as unknown as SessionStore;

        const mockApiClient = {
            startWatching: vi.fn(),
            stopWatching: vi.fn(),
        } as unknown as ApiClient;

        await TestBed.configureTestingModule({
            imports: [TestHost],
            providers: [
                provideRouter([]),
                { provide: SessionStore, useValue: mockSessionStore },
                { provide: CommentStore, useValue: mockCommentStore },
                { provide: TransportStore, useValue: mockTransportStore },
                { provide: ApiClient, useValue: mockApiClient },
            ],
        })
            .overrideComponent(Review, {
                set: { imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] },
            })
            .compileComponents();

        fixture = TestBed.createComponent(TestHost);
        fixture.autoDetectChanges();
        await fixture.whenStable();
        review = fixture.componentInstance.review();
    });

    it('onSendComments calls commentStore.sendComments with correct payload', () => {
        (review as any).onSendComments(['c1', 'c2']);

        expect(sendCommentsSpy).toHaveBeenCalledWith(
            { comment_ids: ['c1', 'c2'], transport_type: 'tmux', target_id: 'pane-1', snapshot_id: 'snap1' },
            expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
        );
    });

    it('onSendComments does nothing when no transport selected', () => {
        activeTransport = null;

        (review as any).onSendComments(['c1']);

        expect(sendCommentsSpy).not.toHaveBeenCalled();
    });

    it('onSendComments does nothing when no target selected', () => {
        lastTargetId = null;

        (review as any).onSendComments(['c1']);

        expect(sendCommentsSpy).not.toHaveBeenCalled();
    });

    it('onSendComments copies to clipboard for clipboard transport', () => {
        activeTransport = 'clipboard';

        const writeTextSpy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

        (review as any).onSendComments(['c1']);

        const call = sendCommentsSpy.mock.calls[0];
        call[1].onSuccess({ comments: [], formatted_text: 'formatted output' });

        expect(writeTextSpy).toHaveBeenCalledWith('formatted output');
    });

    it('onSendComments shows success toast', () => {
        (review as any).onSendComments(['c1']);

        const call = sendCommentsSpy.mock.calls[0];
        call[1].onSuccess({ comments: [] });

        expect((review as any).toastMessage()).toEqual({
            type: 'success',
            text: 'Comments sent via tmux',
        });
    });

    it('onSendComments shows error toast', () => {
        (review as any).onSendComments(['c1']);

        const call = sendCommentsSpy.mock.calls[0];
        call[1].onError(new Error('Network error'));

        expect((review as any).toastMessage()).toEqual({
            type: 'error',
            text: 'Failed to send: Network error',
        });
    });

    it('isSending prevents double-send', () => {
        (review as any).onSendComments(['c1']);

        expect((review as any).isSending()).toBe(true);
        expect((review as any).canSend()).toBe(false);

        const call = sendCommentsSpy.mock.calls[0];
        call[1].onSuccess({ comments: [] });
        expect((review as any).isSending()).toBe(false);
    });
});
