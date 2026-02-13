import {
    databaseError,
    gitError,
    notAGitRepo,
    notFound,
    transportError,
    transportUnavailable,
    validation,
    watcherError,
} from '@agent-code-reviewer/shared';
import { vi } from 'vitest';
import { toHttpError } from '../http-error.js';

describe('toHttpError', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps NOT_FOUND → 404', () => {
        const result = toHttpError(notFound('gone'));
        expect(result).toEqual({ status: 404, code: 'NOT_FOUND', message: 'gone' });
    });

    it('maps VALIDATION → 400', () => {
        const result = toHttpError(validation('bad input'));
        expect(result).toEqual({ status: 400, code: 'VALIDATION', message: 'bad input' });
    });

    it('maps GIT_ERROR NOT_A_GIT_REPO → 400', () => {
        const result = toHttpError(notAGitRepo('/not/repo'));
        expect(result).toEqual({ status: 400, code: 'NOT_A_GIT_REPO', message: 'Not a git repository: /not/repo' });
    });

    it('maps GIT_ERROR OPERATION_FAILED → 500', () => {
        const result = toHttpError(gitError('git failed'));
        expect(result).toEqual({ status: 500, code: 'GIT_ERROR', message: 'Internal server error' });
        expect(console.error).toHaveBeenCalled();
    });

    it('maps DATABASE_ERROR → 500', () => {
        const result = toHttpError(databaseError('db failed'));
        expect(result).toEqual({ status: 500, code: 'DATABASE_ERROR', message: 'Internal server error' });
        expect(console.error).toHaveBeenCalled();
    });

    it('maps WATCHER_ERROR → 500', () => {
        const result = toHttpError(watcherError('watcher failed'));
        expect(result).toEqual({ status: 500, code: 'WATCHER_ERROR', message: 'Internal server error' });
        expect(console.error).toHaveBeenCalled();
    });

    it('maps TRANSPORT_ERROR → 502', () => {
        const result = toHttpError(transportError('transport failed'));
        expect(result).toEqual({ status: 502, code: 'TRANSPORT_ERROR', message: 'Internal server error' });
        expect(console.error).toHaveBeenCalled();
    });

    it('maps TRANSPORT_UNAVAILABLE → 503', () => {
        const result = toHttpError(transportUnavailable('sse'));
        expect(result).toEqual({ status: 503, code: 'TRANSPORT_UNAVAILABLE', message: 'Transport unavailable: sse' });
    });
});
