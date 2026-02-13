import { err, ok } from 'neverthrow';
import { expectErr, expectOk } from './helpers.js';

describe('test helpers', () => {
    describe('expectOk', () => {
        it('returns value for Ok result', () => {
            const result = ok(42);
            expect(expectOk(result)).toBe(42);
        });

        it('returns complex value for Ok result', () => {
            const result = ok({ id: '1', name: 'test' });
            expect(expectOk(result)).toEqual({ id: '1', name: 'test' });
        });

        it('throws for Err result', () => {
            const result = err({ type: 'NOT_FOUND', message: 'gone' });
            expect(() => expectOk(result)).toThrow();
        });
    });

    describe('expectErr', () => {
        it('returns error for Err result', () => {
            const error = { type: 'NOT_FOUND', message: 'gone' };
            const result = err(error);
            expect(expectErr(result)).toEqual(error);
        });

        it('throws for Ok result', () => {
            const result = ok(42);
            expect(() => expectErr(result)).toThrow();
        });
    });
});
