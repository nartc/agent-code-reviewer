import type { Result } from 'neverthrow';
import { expect } from 'vitest';

export function expectOk<T, E>(result: Result<T, E>): T {
    expect(
        result.isOk(),
        `Expected Ok but got Err: ${JSON.stringify(result.isErr() ? (result as any).error : undefined)}`,
    ).toBe(true);
    return (result as any).value;
}

export function expectErr<T, E>(result: Result<T, E>): E {
    expect(
        result.isErr(),
        `Expected Err but got Ok: ${JSON.stringify(result.isOk() ? (result as any).value : undefined)}`,
    ).toBe(true);
    return (result as any).error;
}
