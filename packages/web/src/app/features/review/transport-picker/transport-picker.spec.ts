import type { CommentThread, Target, TransportStatus, TransportType } from '@agent-code-reviewer/shared';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommentStore } from '../../../core/stores/comment-store';
import { TransportStore } from '../../../core/stores/transport-store';
import { TransportPicker } from './transport-picker';

const mockTargets: Target[] = [
    { id: 'pane-1', label: 'Pane 1', transport: 'tmux' as TransportType, metadata: {} },
    { id: 'pane-2', label: 'Pane 2', transport: 'tmux' as TransportType, metadata: {} },
    { id: 'pane-3', label: 'Pane 3', transport: 'tmux' as TransportType, metadata: {} },
    { id: 'mcp-1', label: 'MCP Target', transport: 'mcp' as TransportType, metadata: {} },
];

const mockStatuses: TransportStatus[] = [
    { type: 'tmux' as TransportType, available: true },
    { type: 'mcp' as TransportType, available: false },
    { type: 'clipboard' as TransportType, available: true },
];

const mockDraftComments: CommentThread[] = [
    {
        comment: {
            id: 'c1',
            session_id: 's1',
            snapshot_id: 'snap1',
            reply_to_id: null,
            file_path: 'src/app.ts',
            line_start: 10,
            line_end: 10,
            side: 'new',
            author: 'user',
            content: 'Fix this variable name',
            status: 'draft',
            created_at: '2026-01-01T00:00:00Z',
            sent_at: null,
            resolved_at: null,
        },
        replies: [],
    },
    {
        comment: {
            id: 'c2',
            session_id: 's1',
            snapshot_id: 'snap1',
            reply_to_id: null,
            file_path: 'src/utils.ts',
            line_start: 5,
            line_end: 8,
            side: 'new',
            author: 'user',
            content: 'Extract this into a helper',
            status: 'draft',
            created_at: '2026-01-01T00:00:00Z',
            sent_at: null,
            resolved_at: null,
        },
        replies: [
            {
                id: 'r1',
                session_id: 's1',
                snapshot_id: 'snap1',
                reply_to_id: 'c2',
                file_path: 'src/utils.ts',
                line_start: 5,
                line_end: 8,
                side: 'new',
                author: 'agent',
                content: 'Good suggestion',
                status: 'draft',
                created_at: '2026-01-01T00:00:01Z',
                sent_at: null,
                resolved_at: null,
            },
        ],
    },
];

describe('TransportPicker', () => {
    let fixture: ComponentFixture<TransportPicker>;
    let el: HTMLElement;
    let mockStore: {
        targets: () => Target[];
        statuses: () => TransportStatus[];
        activeTransport: () => TransportType | null;
        lastTargetId: () => string | null;
        isLoading: () => boolean;
        setActiveTransport: ReturnType<typeof vi.fn>;
        refreshTargets: ReturnType<typeof vi.fn>;
    };
    let draftComments: ReturnType<typeof signal<CommentThread[]>>;

    beforeEach(async () => {
        draftComments = signal<CommentThread[]>([]);

        // Create a mock store with signal-like callables
        const targetsFn = Object.assign(() => mockTargets, { set: vi.fn() });
        const statusesFn = Object.assign(() => mockStatuses, { set: vi.fn() });
        const activeTransportFn = Object.assign(() => 'tmux' as TransportType | null, { set: vi.fn() });
        const lastTargetIdFn = Object.assign(() => 'pane-1' as string | null, { set: vi.fn() });
        const isLoadingFn = Object.assign(() => false, { set: vi.fn() });

        mockStore = {
            targets: targetsFn,
            statuses: statusesFn,
            activeTransport: activeTransportFn,
            lastTargetId: lastTargetIdFn,
            isLoading: isLoadingFn,
            setActiveTransport: vi.fn(),
            refreshTargets: vi.fn(),
        } as any;

        await TestBed.configureTestingModule({
            imports: [TransportPicker],
            providers: [
                { provide: TransportStore, useValue: mockStore },
                { provide: CommentStore, useValue: { draftComments } as unknown as CommentStore },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(TransportPicker);
        el = fixture.nativeElement;
        fixture.autoDetectChanges();
    });

    it('renders tmux target buttons when tmux selected', async () => {
        await fixture.whenStable();
        const targetBtns = el.querySelectorAll('.btn.btn-xs.justify-start');
        expect(targetBtns.length).toBe(3);
    });

    it('calls setActiveTransport when target selected', async () => {
        await fixture.whenStable();
        const targetBtns = el.querySelectorAll('.btn.btn-xs.justify-start') as NodeListOf<HTMLButtonElement>;
        targetBtns[1].click();
        await fixture.whenStable();
        expect(mockStore.setActiveTransport).toHaveBeenCalledWith('tmux', 'pane-2');
    });

    it('calls refreshTargets when refresh clicked', async () => {
        await fixture.whenStable();
        const refreshBtn = Array.from(el.querySelectorAll('button')).find((b) => b.title === 'Refresh');
        refreshBtn!.click();
        await fixture.whenStable();
        expect(mockStore.refreshTargets).toHaveBeenCalled();
    });

    it('shows unavailable status for mcp in dropdown', async () => {
        await fixture.whenStable();
        const options = el.querySelectorAll('option');
        const mcpOption = Array.from(options).find((o) => o.value === 'mcp');
        expect(mcpOption).toBeTruthy();
        expect(mcpOption!.disabled).toBe(true);
        expect(mcpOption!.textContent).toContain('(unavailable)');
    });

    it('clipboard always shown as available', async () => {
        await fixture.whenStable();
        const options = el.querySelectorAll('option');
        const clipboardOption = Array.from(options).find((o) => o.value === 'clipboard');
        expect(clipboardOption!.disabled).toBe(false);
        expect(clipboardOption!.textContent).not.toContain('(unavailable)');
    });

    describe('preview', () => {
        it('toggles preview on and off', async () => {
            await fixture.whenStable();
            const previewBtn = Array.from(el.querySelectorAll('button')).find((b) =>
                b.textContent?.trim().includes('Preview'),
            )!;

            // Initially no preview
            expect(el.querySelector('pre')).toBeNull();

            // Click to show
            previewBtn.click();
            await fixture.whenStable();
            expect(el.querySelector('pre')).toBeTruthy();

            // Click to hide
            previewBtn.click();
            await fixture.whenStable();
            expect(el.querySelector('pre')).toBeNull();
        });

        it('shows "No draft comments" when no drafts exist', async () => {
            await fixture.whenStable();
            const previewBtn = Array.from(el.querySelectorAll('button')).find((b) =>
                b.textContent?.trim().includes('Preview'),
            )!;
            previewBtn.click();
            await fixture.whenStable();

            const pre = el.querySelector('pre')!;
            expect(pre.textContent).toBe('No draft comments');
        });

        it('shows formatted text for mock drafts', async () => {
            draftComments.set(mockDraftComments);
            fixture.detectChanges();
            await fixture.whenStable();

            const previewBtn = Array.from(el.querySelectorAll('button')).find((b) =>
                b.textContent?.trim().includes('Preview'),
            )!;
            previewBtn.click();
            await fixture.whenStable();

            const pre = el.querySelector('pre')!;
            expect(pre.textContent).toContain('src/app.ts');
            expect(pre.textContent).toContain('src/utils.ts');
            expect(pre.textContent).toContain('Fix this variable name');
            expect(pre.textContent).toContain('Extract this into a helper');
            expect(pre.textContent).toContain('2 comments across 2 files');
        });

        it('preview area has scrollable styling', async () => {
            draftComments.set(mockDraftComments);
            fixture.detectChanges();
            await fixture.whenStable();

            const previewBtn = Array.from(el.querySelectorAll('button')).find((b) =>
                b.textContent?.trim().includes('Preview'),
            )!;
            previewBtn.click();
            await fixture.whenStable();

            const pre = el.querySelector('pre')!;
            expect(pre.classList.contains('max-h-48')).toBe(true);
            expect(pre.classList.contains('overflow-auto')).toBe(true);
        });
    });
});
