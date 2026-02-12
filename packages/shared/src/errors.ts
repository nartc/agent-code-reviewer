export type AppErrorType =
    | 'NOT_FOUND'
    | 'VALIDATION'
    | 'GIT_ERROR'
    | 'NOT_A_GIT_REPO'
    | 'TRANSPORT_ERROR'
    | 'TRANSPORT_UNAVAILABLE'
    | 'DATABASE_ERROR'
    | 'WATCHER_ERROR';

export interface AppError {
    type: AppErrorType;
    message: string;
    cause?: unknown;
}

export const notFound = (message: string): AppError => ({ type: 'NOT_FOUND', message });

export const validation = (message: string): AppError => ({ type: 'VALIDATION', message });

export const gitError = (message: string, cause?: unknown): AppError => ({ type: 'GIT_ERROR', message, cause });

export const notAGitRepo = (path: string): AppError => ({
    type: 'NOT_A_GIT_REPO',
    message: `Not a git repository: ${path}`,
});

export const transportError = (message: string, cause?: unknown): AppError => ({
    type: 'TRANSPORT_ERROR',
    message,
    cause,
});

export const transportUnavailable = (transport: string): AppError => ({
    type: 'TRANSPORT_UNAVAILABLE',
    message: `Transport unavailable: ${transport}`,
});

export const databaseError = (message: string, cause?: unknown): AppError => ({
    type: 'DATABASE_ERROR',
    message,
    cause,
});

export const watcherError = (message: string, cause?: unknown): AppError => ({ type: 'WATCHER_ERROR', message, cause });

export function errorToStatus(error: AppError): number {
    switch (error.type) {
        case 'NOT_FOUND':
            return 404;
        case 'VALIDATION':
            return 400;
        case 'NOT_A_GIT_REPO':
            return 422;
        case 'TRANSPORT_UNAVAILABLE':
            return 503;
        default:
            return 500;
    }
}
