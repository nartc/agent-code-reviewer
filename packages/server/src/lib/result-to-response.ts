import { type AppError, errorToStatus } from '@agent-code-reviewer/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Result, ResultAsync } from 'neverthrow';

/**
 * Convert a sync Result to a Hono JSON response.
 * ok → c.json(value, status ?? 200)
 * err → c.json({ error: { type, message } }, errorToStatus(error))
 */
export function resultToResponse<T>(c: Context, result: Result<T, AppError>, status?: number): Response {
    if (result.isOk()) {
        return c.json(result.value, (status ?? 200) as ContentfulStatusCode);
    }
    const error = result.error;
    return c.json(
        { error: { type: error.type, message: error.message } },
        errorToStatus(error) as ContentfulStatusCode,
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
