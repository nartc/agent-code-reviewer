import type { Target, TransportStatus, TransportType } from '@agent-code-reviewer/shared';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

    beforeEach(async () => {
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
            providers: [{ provide: TransportStore, useValue: mockStore }],
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
});
