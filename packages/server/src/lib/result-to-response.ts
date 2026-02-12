import type { AppError } from '@agent-code-reviewer/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Result, ResultAsync } from 'neverthrow';
import { toHttpError } from './http-error.js';

/**
 * Convert a sync Result to a Hono JSON response.
 * ok → c.json(value, status ?? 200)
 * err → c.json({ error: { code, message } }, httpStatus)
 */
export function resultToResponse<T>(c: Context, result: Result<T, AppError>, status?: number): Response {
    if (result.isOk()) {
        return c.json(result.value, (status ?? 200) as ContentfulStatusCode);
    }
    const httpError = toHttpError(result.error);
    return c.json(
        { error: { code: httpError.code, message: httpError.message } },
        httpError.status as ContentfulStatusCode,
    );
}

/**
 * Convert a ResultAsync to a Hono JSON response.
 */
export async function asyncResultToResponse<T>(
    c: Context,
    resultAsync: ResultAsync<T, AppError>,
    status?: number,
): Promise<Response> {
    const result = await resultAsync;
    return resultToResponse(c, result, status);
}
