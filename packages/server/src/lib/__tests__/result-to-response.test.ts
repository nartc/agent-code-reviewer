import { Hono } from 'hono';
import { ok, err, okAsync } from 'neverthrow';
import { notFound, validation, databaseError } from '@agent-code-reviewer/shared';
import { resultToResponse, asyncResultToResponse } from '../result-to-response.js';

describe('resultToResponse', () => {
  it('returns 200 with ok value', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      return resultToResponse(c, ok({ id: '1', name: 'test' }));
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: '1', name: 'test' });
  });

  it('returns custom status with ok value', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      return resultToResponse(c, ok({ id: '1' }), 201);
    });

    const res = await app.request('/test');
    expect(res.status).toBe(201);
  });

  it('returns 404 for notFound error', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      return resultToResponse(c, err(notFound('Repo not found')));
    });

    const res = await app.request('/test');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: { type: 'NOT_FOUND', message: 'Repo not found' },
    });
  });

  it('returns 400 for validation error', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      return resultToResponse(c, err(validation('Invalid input')));
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: { type: 'VALIDATION', message: 'Invalid input' },
    });
  });

  it('returns 500 for databaseError', async () => {
    const app = new Hono();
    app.get('/test', (c) => {
      return resultToResponse(c, err(databaseError('DB failure')));
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);
  });
});

describe('asyncResultToResponse', () => {
  it('works with ResultAsync', async () => {
    const app = new Hono();
    app.get('/test', async (c) => {
      return asyncResultToResponse(c, okAsync({ data: 'test' }));
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: 'test' });
  });
});
