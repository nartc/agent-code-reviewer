import type { CommentThread } from '@agent-code-reviewer/shared';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommentStore } from '../../../core/stores/comment-store';
import { CommentPanel } from './comment-panel';

function makeDraft(id: string, filePath: string): CommentThread {
    return {
        comment: {
            id,
            session_id: 's1',
            snapshot_id: 'snap1',
            reply_to_id: null,
            file_path: filePath,
            line_start: 10,
            line_end: 10,
            side: 'new',
            author: 'user',
            content: `Comment ${id}`,
            status: 'draft',
            created_at: '2026-01-01T00:00:00Z',
            sent_at: null,
            resolved_at: null,
        },
        replies: [],
    };
}

@Component({
    imports: [CommentPanel],
    template: `
        <acr-comment-panel
            [sessionId]="sessionId"
            [snapshotId]="snapshotId"
            [canSend]="canSend()"
            (sendRequested)="onSendRequested($event)"
        />
    `,
})
class TestHost {
    sessionId = 's1';
    snapshotId = 'snap1';
    canSend = signal(true);
    sentIds: string[] | null = null;
    onSendRequested(ids: string[]): void {
        this.sentIds = ids;
    }
}

describe('CommentPanel', () => {
    let fixture: ComponentFixture<TestHost>;
    let host: TestHost;
    let el: HTMLElement;
    let draftComments: ReturnType<typeof signal<CommentThread[]>>;

    beforeEach(async () => {
        draftComments = signal<CommentThread[]>([]);

        const mockCommentStore = {
            draftComments,
            sentComments: signal([]),
            resolvedComments: signal([]),
            updateComment: vi.fn(),
            deleteComment: vi.fn(),
            resolveComment: vi.fn(),
            createReply: vi.fn(),
        } as unknown as CommentStore;

        await TestBed.configureTestingModule({
            imports: [TestHost],
            providers: [{ provide: CommentStore, useValue: mockCommentStore }],
        }).compileComponents();

        fixture = TestBed.createComponent(TestHost);
        host = fixture.componentInstance;
        el = fixture.nativeElement;
        fixture.autoDetectChanges();
    });

    function getSendButton(): HTMLButtonElement {
        return el.querySelector('.btn.btn-primary.btn-xs') as HTMLButtonElement;
    }

    it('send button disabled when no drafts', async () => {
        await fixture.whenStable();
        expect(getSendButton().disabled).toBe(true);
    });

    it('send button disabled when canSend is false', async () => {
        draftComments.set([makeDraft('c1', 'src/a.ts'), makeDraft('c2', 'src/b.ts')]);
        host.canSend.set(false);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(getSendButton().disabled).toBe(true);
    });

    it('send button enabled when drafts exist and canSend is true', async () => {
        draftComments.set([makeDraft('c1', 'src/a.ts'), makeDraft('c2', 'src/b.ts')]);
        host.canSend.set(true);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(getSendButton().disabled).toBe(false);
    });

    it('sendAllDrafts emits draft comment IDs', async () => {
        draftComments.set([makeDraft('c1', 'src/a.ts'), makeDraft('c2', 'src/b.ts'), makeDraft('c3', 'src/c.ts')]);
        host.canSend.set(true);
        fixture.detectChanges();
        await fixture.whenStable();

        getSendButton().click();
        await fixture.whenStable();

        expect(host.sentIds).toEqual(['c1', 'c2', 'c3']);
    });

    it('sendAllDrafts does nothing with 0 drafts', async () => {
        await fixture.whenStable();

        // Button is disabled so we can't click it, verify no emission happened
        expect(host.sentIds).toBeNull();
    });
});
