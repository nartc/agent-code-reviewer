import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TransportStore } from './transport-store';
import { ApiClient } from '../services/api-client';
import type { Target, TransportStatus } from '@agent-code-reviewer/shared';

const mockTargets: Target[] = [
    { id: 't1', label: 'tmux-0', transport: 'tmux' },
    { id: 't2', label: 'clipboard', transport: 'clipboard' },
    { id: 't3', label: 'mcp-server', transport: 'mcp' },
];

const mockStatuses: TransportStatus[] = [
    { type: 'tmux', available: true },
    { type: 'clipboard', available: true },
    { type: 'mcp', available: false, error: 'not configured' },
];

describe('TransportStore', () => {
    let store: TransportStore;
    let apiSpy: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
        apiSpy = {
            listTargets: vi.fn().mockReturnValue(of({ targets: mockTargets })),
            getTransportStatus: vi.fn().mockReturnValue(of({ statuses: mockStatuses })),
            getTransportConfig: vi.fn().mockReturnValue(of({ active_transport: 'tmux', last_target_id: 't1', settings: null })),
            updateTransportConfig: vi.fn().mockReturnValue(of({ message: 'ok' })),
        };

        TestBed.configureTestingModule({
            providers: [{ provide: ApiClient, useValue: apiSpy }],
        });
        store = TestBed.inject(TransportStore);
    });

    it('loadTargets sets targets', () => {
        store.loadTargets();
        expect(store.targets().length).toBe(3);
    });

    it('loadConfig sets activeTransport and lastTargetId', () => {
        store.loadConfig();
        expect(store.activeTransport()).toBe('tmux');
        expect(store.lastTargetId()).toBe('t1');
    });

    it('setActiveTransport updates state on success', () => {
        store.setActiveTransport('clipboard');
        expect(store.activeTransport()).toBe('clipboard');
        expect(store.lastTargetId()).toBeNull();
    });

    it('setActiveTransport with targetId', () => {
        store.setActiveTransport('tmux', 't2');
        expect(store.activeTransport()).toBe('tmux');
        expect(store.lastTargetId()).toBe('t2');
    });

    it('refreshTargets updates both targets and statuses', () => {
        store.refreshTargets();
        expect(store.targets().length).toBe(3);
        expect(store.statuses().length).toBe(3);
    });

    it('loadStatus sets statuses', () => {
        store.loadStatus();
        expect(store.statuses().length).toBe(3);
    });
});
