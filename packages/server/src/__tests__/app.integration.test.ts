import { Hono } from 'hono';
import { createApp } from '../app.js';
import { initInMemoryDatabase } from '../db/client.js';
import { DbService } from '../services/db.service.js';

describe('App Integration', () => {
    let app: Hono;
    let dbService: DbService;

    beforeEach(async () => {
        const result = await initInMemoryDatabase();
        expect(result.isOk()).toBe(true);

        const db = result._unsafeUnwrap();
        dbService = new DbService(db, '/tmp/test-app.db', {
            autoSave: false,
            shutdownHooks: false,
        });

        app = createApp({ dbService });
    });

    afterEach(() => {
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    it('health check returns 200 ok', async () => {
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
        // Add a test route that throws
        app.get('/api/test-error', () => {
            throw new Error('test explosion');
        });

        const res = await app.request('/api/test-error');
        const body = (await res.json()) as { error: { type: string; message: string } };
        expect(body.error).toBeDefined();
        expect(body.error.type).toBe('INTERNAL');
    });
});
