import type { ErrorHandler } from 'hono';
import { errorToStatus, type AppError } from '@agent-code-reviewer/shared';

/**
 * Catch-all Hono error handler.
 * - If error has `type` property (AppError shape): use errorToStatus for HTTP status
 * - Otherwise: 500 with generic message
 * - Always logs to stderr
 */
export const errorHandler: ErrorHandler = (error, c) => {
  console.error('[error-handler]', error);

  // Check if it looks like an AppError (has `type` and `message`)
  if (
    error &&
    typeof error === 'object' &&
    'type' in error &&
    'message' in error
  ) {
    const appError = error as unknown as AppError;
    const status = errorToStatus(appError);
    return c.json(
      { error: { type: appError.type, message: appError.message } },
      status as any
    );
  }

  // Generic error
  return c.json(
    { error: { type: 'INTERNAL', message: 'Internal server error' } },
    500
  );
};
