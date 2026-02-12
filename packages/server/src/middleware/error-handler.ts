import type { AppError } from '@agent-code-reviewer/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { toHttpError } from '../lib/http-error.js';

/**
 * Catch-all Hono error handler.
 * - If error has `type` property (AppError shape): use toHttpError for HTTP mapping
 * - Otherwise: 500 with generic message
 * - Always logs to stderr
 */
export function errorHandler(error: Error, c: Context): Response {
    console.error('[error-handler]', error);

    if (error && typeof error === 'object' && 'type' in error && 'message' in error) {
        const appError = error as unknown as AppError;
        const httpError = toHttpError(appError);
        return c.json(
            { error: { code: httpError.code, message: httpError.message } },
            httpError.status as ContentfulStatusCode,
        );
    }

    return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500);
}
