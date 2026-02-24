import type { AppError } from '@agent-code-reviewer/shared';

export interface HttpError {
    readonly status: number;
    readonly code: string;
    readonly message: string;
}

export function toHttpError(error: AppError): HttpError {
    switch (error.type) {
        case 'NOT_FOUND':
            return { status: 404, code: 'NOT_FOUND', message: error.message };
        case 'VALIDATION':
            return { status: 400, code: 'VALIDATION', message: error.message };
        case 'GIT_ERROR':
            if (error.code === 'NOT_A_GIT_REPO') {
                return { status: 400, code: 'NOT_A_GIT_REPO', message: error.message };
            }
            console.error('[toHttpError] GitError:', error);
            return { status: 500, code: 'GIT_ERROR', message: 'Internal server error' };
        case 'DATABASE_ERROR':
            console.error('[toHttpError] DatabaseError:', error);
            return { status: 500, code: 'DATABASE_ERROR', message: 'Internal server error' };
        case 'WATCHER_ERROR':
            console.error('[toHttpError] WatcherError:', error);
            return { status: 500, code: 'WATCHER_ERROR', message: 'Internal server error' };
        case 'TRANSPORT_ERROR':
            console.error('[toHttpError] TransportError:', error);
            return { status: 502, code: 'TRANSPORT_ERROR', message: 'Internal server error' };
        case 'TRANSPORT_UNAVAILABLE':
            return { status: 503, code: 'TRANSPORT_UNAVAILABLE', message: error.message };
    }
}
