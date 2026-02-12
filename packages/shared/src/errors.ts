export interface NotFoundError {
    readonly type: 'NOT_FOUND';
    readonly message: string;
}

export interface ValidationError {
    readonly type: 'VALIDATION';
    readonly message: string;
}

export type GitErrorCode = 'NOT_A_GIT_REPO' | 'OPERATION_FAILED';

export interface GitError {
    readonly type: 'GIT_ERROR';
    readonly code: GitErrorCode;
    readonly message: string;
    readonly cause?: unknown;
}

export interface DatabaseError {
    readonly type: 'DATABASE_ERROR';
    readonly message: string;
    readonly cause?: unknown;
}

export interface WatcherError {
    readonly type: 'WATCHER_ERROR';
    readonly message: string;
    readonly cause?: unknown;
}

export interface TransportError {
    readonly type: 'TRANSPORT_ERROR';
    readonly message: string;
    readonly cause?: unknown;
}

export interface TransportUnavailableError {
    readonly type: 'TRANSPORT_UNAVAILABLE';
    readonly message: string;
}

export type AppError =
    | NotFoundError
    | ValidationError
    | GitError
    | DatabaseError
    | WatcherError
    | TransportError
    | TransportUnavailableError;

export function notFound(message: string): NotFoundError {
    return { type: 'NOT_FOUND', message };
}

export function validation(message: string): ValidationError {
    return { type: 'VALIDATION', message };
}

export function gitError(message: string, cause?: unknown): GitError {
    return { type: 'GIT_ERROR', code: 'OPERATION_FAILED', message, cause };
}

export function notAGitRepo(path: string): GitError {
    return { type: 'GIT_ERROR', code: 'NOT_A_GIT_REPO', message: `Not a git repository: ${path}` };
}

export function transportError(message: string, cause?: unknown): TransportError {
    return { type: 'TRANSPORT_ERROR', message, cause };
}

export function transportUnavailable(transport: string): TransportUnavailableError {
    return { type: 'TRANSPORT_UNAVAILABLE', message: `Transport unavailable: ${transport}` };
}

export function databaseError(message: string, cause?: unknown): DatabaseError {
    return { type: 'DATABASE_ERROR', message, cause };
}

export function watcherError(message: string, cause?: unknown): WatcherError {
    return { type: 'WATCHER_ERROR', message, cause };
}
