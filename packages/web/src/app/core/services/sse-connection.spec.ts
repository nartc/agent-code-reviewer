import type { SseEvent } from '@agent-code-reviewer/shared';
import { TestBed } from '@angular/core/testing';
import { SseConnection } from './sse-connection';

class MockEventSource {
    static instances: MockEventSource[] = [];
    url: string;
    listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
    onerror: (() => void) | null = null;
    closed = false;

    constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
    }

    addEventListener(type: string, handler: (event: MessageEvent) => void): void {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(handler);
    }

    close(): void {
        this.closed = true;
    }

    simulateEvent(type: string, data: unknown): void {
        const handlers = this.listeners[type] || [];
        const event = { data: JSON.stringify(data) } as MessageEvent;
        handlers.forEach((h) => h(event));
    }

    simulateError(): void {
        this.onerror?.();
    }
}

describe('SseConnection', () => {
    let service: SseConnection;
    let originalEventSource: typeof EventSource;

    beforeEach(() => {
        MockEventSource.instances = [];
        originalEventSource = globalThis.EventSource;
        (globalThis as Record<string, unknown>)['EventSource'] = MockEventSource;

        TestBed.configureTestingModule({});
        service = TestBed.inject(SseConnection);
    });

    afterEach(() => {
        service.disconnect();
        (globalThis as Record<string, unknown>)['EventSource'] = originalEventSource;
    });

    it('connects to correct URL', () => {
        service.connect('session-abc').subscribe();
        expect(MockEventSource.instances.length).toBe(1);
        expect(MockEventSource.instances[0].url).toBe('/api/sse/sessions/session-abc');
    });

    it('parses snapshot event correctly', () => {
        const events: SseEvent[] = [];
        service.connect('s1').subscribe((e) => events.push(e));
        const es = MockEventSource.instances[0];
        const data = { id: 'snap1', session_id: 's1' };
        es.simulateEvent('snapshot', data);
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('snapshot');
        expect(events[0].data).toEqual(data);
    });

    it('parses all 5 event types', () => {
        const events: SseEvent[] = [];
        service.connect('s1').subscribe((e) => events.push(e));
        const es = MockEventSource.instances[0];

        es.simulateEvent('connected', { session_id: 's1' });
        es.simulateEvent('snapshot', { id: 'snap1', session_id: 's1' });
        es.simulateEvent('comment-update', { session_id: 's1', comment_id: 'c1', action: 'created' });
        es.simulateEvent('watcher-status', { session_id: 's1', is_watching: true });
        es.simulateEvent('heartbeat', { timestamp: '2025-01-01T00:00:00Z' });

        expect(events.map((e) => e.type)).toEqual([
            'connected',
            'snapshot',
            'comment-update',
            'watcher-status',
            'heartbeat',
        ]);
    });

    it('reconnects with exponential backoff on error', () => {
        vi.useFakeTimers();
        service.connect('s1').subscribe();
        expect(MockEventSource.instances.length).toBe(1);

        MockEventSource.instances[0].simulateError();
        vi.advanceTimersByTime(1000);
        expect(MockEventSource.instances.length).toBe(2);

        MockEventSource.instances[1].simulateError();
        vi.advanceTimersByTime(2000);
        expect(MockEventSource.instances.length).toBe(3);

        MockEventSource.instances[2].simulateError();
        vi.advanceTimersByTime(4000);
        expect(MockEventSource.instances.length).toBe(4);

        service.disconnect();
        vi.useRealTimers();
    });

    it('resets backoff on connected event', () => {
        vi.useFakeTimers();
        service.connect('s1').subscribe();

        MockEventSource.instances[0].simulateError();
        vi.advanceTimersByTime(1000);
        expect(MockEventSource.instances.length).toBe(2);

        MockEventSource.instances[1].simulateEvent('connected', { session_id: 's1' });

        MockEventSource.instances[1].simulateError();
        vi.advanceTimersByTime(1000);
        expect(MockEventSource.instances.length).toBe(3);

        service.disconnect();
        vi.useRealTimers();
    });

    it('disconnect closes EventSource', () => {
        service.connect('s1').subscribe();
        const es = MockEventSource.instances[0];
        service.disconnect();
        expect(es.closed).toBe(true);
    });

    it('shares observable between multiple subscribers', () => {
        const obs = service.connect('s1');
        const events1: SseEvent[] = [];
        const events2: SseEvent[] = [];

        obs.subscribe((e) => events1.push(e));
        obs.subscribe((e) => events2.push(e));

        expect(MockEventSource.instances.length).toBe(1);

        MockEventSource.instances[0].simulateEvent('heartbeat', { timestamp: 'now' });
        expect(events1.length).toBe(1);
        expect(events2.length).toBe(1);
    });

    it('skips malformed JSON with console warning', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        service.connect('s1').subscribe();
        const es = MockEventSource.instances[0];

        const handlers = es.listeners['snapshot'] || [];
        handlers.forEach((h) => h({ data: 'not-json' } as MessageEvent));

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('closes existing connection when connect called again', () => {
        service.connect('s1').subscribe();
        const first = MockEventSource.instances[0];
        service.connect('s2').subscribe();
        expect(first.closed).toBe(true);
        expect(MockEventSource.instances.length).toBe(2);
    });
});
