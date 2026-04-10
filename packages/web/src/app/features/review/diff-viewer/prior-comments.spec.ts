import type { CommentThread } from '@agent-code-reviewer/shared';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PriorSnapshotComments } from './prior-comments';
import { PriorComments } from './prior-comments';

function makeThread(): CommentThread {
    return {
        comment: {
            id: 'c1',
            session_id: 's1',
            snapshot_id: 'snap-1',
            reply_to_id: null,
            file_path: 'src/example.ts',
            line_start: 10,
            line_end: 10,
            side: 'new',
            author: 'user',
            content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5 FULL_CONTENT_TAIL_MARKER',
            status: 'resolved',
            created_at: '2026-01-01T00:00:00Z',
            sent_at: '2026-01-01T00:01:00Z',
            resolved_at: '2026-01-01T00:02:00Z',
        },
        replies: [
            {
                id: 'r1',
                session_id: 's1',
                snapshot_id: 'snap-1',
                reply_to_id: 'c1',
                file_path: 'src/example.ts',
                line_start: 10,
                line_end: 10,
                side: 'new',
                author: 'agent',
                content: 'Reply with long text and REPLY_FULL_CONTENT_TAIL_MARKER',
                status: 'resolved',
                created_at: '2026-01-01T00:03:00Z',
                sent_at: '2026-01-01T00:03:00Z',
                resolved_at: '2026-01-01T00:04:00Z',
            },
        ],
    };
}

describe('PriorComments', () => {
    let fixture: ComponentFixture<PriorComments>;
    let el: HTMLElement;

    beforeEach(async () => {
        const groups: PriorSnapshotComments[] = [
            {
                snapshot: {
                    id: 'snap-1',
                    session_id: 's1',
                    files_summary: [],
                    head_commit: null,
                    trigger: 'manual',
                    changed_files: null,
                    has_review_comments: true,
                    created_at: '2026-01-01T00:00:00Z',
                },
                threads: [makeThread()],
            },
        ];

        await TestBed.configureTestingModule({
            imports: [PriorComments],
        }).compileComponents();

        fixture = TestBed.createComponent(PriorComments);
        fixture.componentRef.setInput('groups', groups);
        fixture.componentRef.setInput('totalCount', 1);
        el = fixture.nativeElement;
        fixture.autoDetectChanges();
    });

    it('shows full thread/reply text without clamp classes when expanded', async () => {
        await fixture.whenStable();

        const expandButton = el.querySelector('button') as HTMLButtonElement;
        expandButton.click();
        fixture.detectChanges();
        await fixture.whenStable();

        const paragraphs = Array.from(el.querySelectorAll('p.whitespace-pre-wrap')) as HTMLParagraphElement[];
        expect(paragraphs.length).toBeGreaterThanOrEqual(2);

        const threadText = paragraphs[0];
        const replyText = paragraphs[1];

        expect(threadText.textContent).toContain('FULL_CONTENT_TAIL_MARKER');
        expect(replyText.textContent).toContain('REPLY_FULL_CONTENT_TAIL_MARKER');
        expect(threadText.className).not.toContain('line-clamp');
        expect(replyText.className).not.toContain('line-clamp');
    });
});
