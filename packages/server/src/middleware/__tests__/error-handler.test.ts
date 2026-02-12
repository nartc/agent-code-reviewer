import { Hono } from 'hono';
import { errorHandler } from '../error-handler.js';

describe('errorHandler', () => {
    it('returns correct HTTP status for AppError with known type', async () => {
        const app = new Hono();
        app.onError(errorHandler);
        app.get('/test', () => {
            throw Object.assign(new Error('gone'), { type: 'NOT_FOUND', message: 'gone' });
        });

        const res = await app.request('/test');
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body).toEqual({
            error: { code: 'NOT_FOUND', message: 'gone' },
        });
    });

    it('returns 500 for unknown error', async () => {
        const app = new Hono();
        app.onError(errorHandler);
        app.get('/test', () => {
            throw new Error('something broke');
        });

        const res = await app.request('/test');
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).toEqual({
            error: { code: 'INTERNAL', message: 'Internal server error' },
        });
    });

    it('response body has error.type and error.message', async () => {
        const app = new Hono();
        app.onError(errorHandler);
        app.get('/test', () => {
            throw Object.assign(new Error('bad'), {
                type: 'VALIDATION',
                message: 'bad input',
            });
        });

        const res = await app.request('/test');
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error).toHaveProperty('code');
        expect(body.error).toHaveProperty('message');
        expect(typeof body.error.code).toBe('string');
        expect(typeof body.error.message).toBe('string');
    });
});
