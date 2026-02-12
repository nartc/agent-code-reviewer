import {
    databaseError,
    gitError,
    notAGitRepo,
    notFound,
    transportError,
    transportUnavailable,
    validation,
    watcherError,
} from '../errors.js';

describe('error constructors', () => {
    it('notFound produces correct type and message', () => {
        const err = notFound('User not found');
        expect(err).toEqual({ type: 'NOT_FOUND', message: 'User not found' });
    });

    it('validation produces correct type and message', () => {
        const err = validation('Invalid email');
        expect(err).toEqual({ type: 'VALIDATION', message: 'Invalid email' });
    });

    it('gitError produces correct type, code, message, and cause', () => {
        const cause = new Error('timeout');
        const err = gitError('clone failed', cause);
        expect(err).toEqual({ type: 'GIT_ERROR', code: 'OPERATION_FAILED', message: 'clone failed', cause });
    });

    it('gitError without cause omits it', () => {
        const err = gitError('fail');
        expect(err).toEqual({ type: 'GIT_ERROR', code: 'OPERATION_FAILED', message: 'fail', cause: undefined });
    });

    it('notAGitRepo returns GitError with NOT_A_GIT_REPO code', () => {
        const err = notAGitRepo('/tmp/foo');
        expect(err).toEqual({
            type: 'GIT_ERROR',
            code: 'NOT_A_GIT_REPO',
            message: 'Not a git repository: /tmp/foo',
        });
    });

    it('transportError with cause', () => {
        const cause = new Error('network');
        const err = transportError('send failed', cause);
        expect(err).toEqual({ type: 'TRANSPORT_ERROR', message: 'send failed', cause });
    });

    it('transportUnavailable includes transport name', () => {
        const err = transportUnavailable('tmux');
        expect(err).toEqual({ type: 'TRANSPORT_UNAVAILABLE', message: 'Transport unavailable: tmux' });
    });

    it('databaseError with cause', () => {
        const cause = new Error('connection lost');
        const err = databaseError('query failed', cause);
        expect(err).toEqual({ type: 'DATABASE_ERROR', message: 'query failed', cause });
    });

    it('watcherError with cause', () => {
        const cause = new Error('inotify limit');
        const err = watcherError('watch failed', cause);
        expect(err).toEqual({ type: 'WATCHER_ERROR', message: 'watch failed', cause });
    });
});
