import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';
import type { ValidationTargets } from 'hono';

/**
 * Validation middleware wrapper around @hono/zod-validator.
 * Returns validation errors in consistent format:
 * { error: { type: 'VALIDATION', message, details } }
 */
export function validate<
  Target extends keyof ValidationTargets,
  T extends ZodSchema
>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            type: 'VALIDATION' as const,
            message: 'Validation failed',
            details: result.error.flatten().fieldErrors,
          },
        },
        400
      );
    }
    return undefined;
  });
}
