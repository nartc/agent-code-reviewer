import { Hono } from 'hono';
import { vi } from 'vitest';
import { expectOk } from './helpers.js';
import { createApp } from '../app.js';
import { initInMemoryDatabase } from '../db/client.js';
import { DbService } from '../services/db.service.js';
import type { SseService } from '../services/sse.service.js';
import type { WatcherService } from '../services/watcher.service.js';

function createMockSseService(): SseService {
    return {
        addConnection: vi.fn(),
        removeConnection: vi.fn(),
        broadcast: vi.fn(),
        getConnectionCount: vi.fn().mockReturnValue(0),
        shutdown: vi.fn(),
    } as unknown as SseService;
}

function createMockWatcherService(): WatcherService {
    return {
        startWatching: vi.fn(),
        stopWatching: vi.fn(),
        captureSnapshot: vi.fn(),
        isWatching: vi.fn().mockReturnValue(false),
        stopAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as WatcherService;
}

describe('App Integration', () => {
    let app: Hono;
    let dbService: DbService;

    beforeEach(async () => {
        const result = await initInMemoryDatabase();
        const db = expectOk(result);
        dbService = new DbService(db, '/tmp/test-app.db', {
            autoSave: false,
            shutdownHooks: false,
        });

        app = createApp({
            dbService,
            sseService: createMockSseService(),
            watcherService: createMockWatcherService(),
        });
    });

    afterEach(() => {
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    it('health check returns 200 ok (AC-3.6)', async () => {
        const res = await app.request('/api/health');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ status: 'ok' });
    });

    it('CORS headers present', async () => {
        const res = await app.request('/api/health', {
            headers: { Origin: 'http://localhost:4200' },
        });

        expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });

    it('unknown routes return 404', async () => {
        const res = await app.request('/api/nonexistent');
        expect(res.status).toBe(404);
    });

    it('error handler catches thrown errors', async () => {
        app.get('/api/test-error', () => {
            throw new Error('test explosion');
        });

        const res = await app.request('/api/test-error');
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('INTERNAL');
    });

    it('SSE endpoint returns event stream (AC-3.1)', async () => {
        const res = await app.request('/api/sse/sessions/test-id');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    });
});
