import type { Target, TransportStatus } from '@agent-code-reviewer/shared';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '../services/api-client';
import { TransportStore } from './transport-store';

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
    let httpMock: HttpTestingController;
    let apiSpy: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
        apiSpy = {
            updateTransportConfig: vi.fn().mockReturnValue(of({ message: 'ok' })),
        };

        TestBed.configureTestingModule({
            providers: [
                provideZonelessChangeDetection(),
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: ApiClient, useValue: apiSpy },
            ],
        });
        store = TestBed.inject(TransportStore);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    async function flushInitialResources() {
        TestBed.tick();
        httpMock.expectOne('/api/transport/targets').flush({ targets: mockTargets });
        httpMock.expectOne('/api/transport/status').flush({ statuses: mockStatuses });
        httpMock
            .expectOne('/api/transport/config')
            .flush({ active_transport: 'tmux', last_target_id: 't1', settings: null });
        await new Promise((r) => setTimeout(r, 0));
        TestBed.tick();
    }

    it('resources load targets, statuses, and config on init', async () => {
        await flushInitialResources();
        expect(store.targets().length).toBe(3);
        expect(store.statuses().length).toBe(3);
        expect(store.activeTransport()).toBe('tmux');
        expect(store.lastTargetId()).toBe('t1');
    });

    it('setActiveTransport calls API and reloads config', async () => {
        await flushInitialResources();
        store.setActiveTransport('clipboard');
        expect(apiSpy['updateTransportConfig']).toHaveBeenCalledWith({
            active_transport: 'clipboard',
            last_target_id: undefined,
        });
        TestBed.tick();
        httpMock
            .expectOne('/api/transport/config')
            .flush({ active_transport: 'clipboard', last_target_id: null, settings: null });
        await new Promise((r) => setTimeout(r, 0));
        TestBed.tick();
        expect(store.activeTransport()).toBe('clipboard');
        expect(store.lastTargetId()).toBeNull();
    });

    it('setActiveTransport with targetId', async () => {
        await flushInitialResources();
        store.setActiveTransport('tmux', 't2');
        expect(apiSpy['updateTransportConfig']).toHaveBeenCalledWith({
            active_transport: 'tmux',
            last_target_id: 't2',
        });
        TestBed.tick();
        httpMock
            .expectOne('/api/transport/config')
            .flush({ active_transport: 'tmux', last_target_id: 't2', settings: null });
        await new Promise((r) => setTimeout(r, 0));
        TestBed.tick();
        expect(store.activeTransport()).toBe('tmux');
        expect(store.lastTargetId()).toBe('t2');
    });

    it('refreshTargets reloads targets and statuses', async () => {
        await flushInitialResources();
        store.refreshTargets();
        TestBed.tick();
        httpMock.expectOne('/api/transport/targets').flush({ targets: mockTargets });
        httpMock.expectOne('/api/transport/status').flush({ statuses: mockStatuses });
        await new Promise((r) => setTimeout(r, 0));
        TestBed.tick();
        expect(store.targets().length).toBe(3);
        expect(store.statuses().length).toBe(3);
    });

    it('isLoading reflects resource loading state', async () => {
        TestBed.tick();
        expect(store.isLoading()).toBe(true);
        httpMock.expectOne('/api/transport/targets').flush({ targets: mockTargets });
        httpMock.expectOne('/api/transport/status').flush({ statuses: mockStatuses });
        httpMock
            .expectOne('/api/transport/config')
            .flush({ active_transport: 'tmux', last_target_id: 't1', settings: null });
        await new Promise((r) => setTimeout(r, 0));
        TestBed.tick();
        expect(store.isLoading()).toBe(false);
    });
});
