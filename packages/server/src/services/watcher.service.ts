import {
    generateId,
    watcherError,
    type DatabaseError,
    type FileSummary,
    type GitError,
    type NotFoundError,
    type Snapshot,
    type SnapshotTrigger,
    type WatcherError,
} from '@agent-code-reviewer/shared';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { watch, type FSWatcher } from 'node:fs';
import { relative } from 'node:path';
import type { DbService } from './db.service.js';
import type { GitService } from './git.service.js';
import type { SessionService } from './session.service.js';
import type { SseService } from './sse.service.js';

const DEBOUNCE_MS = 1500;
const MIN_SNAPSHOT_GAP_MS = 3000;

interface ActiveWatcher {
    watcher: FSWatcher;
    sessionId: string;
    repoPath: string;
    debounceTimer: NodeJS.Timeout | null;
    lastSnapshotAt: number;
}

interface SnapshotRow {
    id: string;
    session_id: string;
    raw_diff: string;
    files_summary: string;
    head_commit: string | null;
    trigger: string;
    changed_files: string | null;
    has_review_comments: number;
    created_at: string;
}

const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.cache',
    'coverage',
    '__pycache__',
    '.venv',
]);
const IGNORED_FILES = new Set(['.DS_Store']);

function shouldIgnore(filePath: string, repoPath: string): boolean {
    const rel = relative(repoPath, filePath);
    const segments = rel.split('/');
    for (const segment of segments) {
        if (IGNORED_DIRS.has(segment)) return true;
        if (IGNORED_FILES.has(segment)) return true;
    }
    return false;
}

function splitDiffByFile(rawDiff: string): Map<string, string> {
    const result = new Map<string, string>();
    const sections = rawDiff.split(/(?=^diff --git )/m);
    for (const section of sections) {
        const match = section.match(/^diff --git a\/(.+?) b\/(.+)/m);
        if (match) {
            result.set(match[2], section);
        }
    }
    return result;
}

function computeChangedFiles(
    current: FileSummary[],
    previous: FileSummary[],
    currentRawDiff: string,
    previousRawDiff: string,
): string[] {
    if (previous.length === 0) return [];
    if (currentRawDiff === previousRawDiff) return [];

    const changed = new Set<string>();
    const currentPatches = splitDiffByFile(currentRawDiff);
    const previousPatches = splitDiffByFile(previousRawDiff);

    // Compare per-file diff content (catches edits that don't change stats)
    const allDiffPaths = new Set([...currentPatches.keys(), ...previousPatches.keys()]);
    for (const path of allDiffPaths) {
        if (currentPatches.get(path) !== previousPatches.get(path)) {
            changed.add(path);
        }
    }

    // Also compare files_summary stats (catches renames and path-format mismatches)
    const previousMap: Record<string, FileSummary> = {};
    for (const file of previous) {
        previousMap[file.path] = file;
    }

    const currentPaths = new Set<string>();
    for (const file of current) {
        currentPaths.add(file.path);
        const prev = previousMap[file.path];
        if (!prev) {
            changed.add(file.path);
        } else if (
            prev.additions !== file.additions ||
            prev.deletions !== file.deletions ||
            prev.status !== file.status
        ) {
            changed.add(file.path);
        }
    }

    for (const file of previous) {
        if (!currentPaths.has(file.path)) {
            changed.add(file.path);
        }
    }

    return [...changed];
}

export { computeChangedFiles, shouldIgnore as createIgnoreFunction };

export class WatcherService {
    private activeWatchers: Record<string, ActiveWatcher> = {};

    constructor(
        private dbService: DbService,
        private gitService: GitService,
        private sessionService: SessionService,
        private sseService: SseService,
    ) {}

    startWatching(
        sessionId: string,
        repoPath: string,
    ): ResultAsync<void, WatcherError | DatabaseError | NotFoundError> {
        const sessionResult = this.sessionService.getSession(sessionId);
        if (sessionResult.isErr()) return errAsync(sessionResult.error);

        if (this.activeWatchers[sessionId]) return okAsync(undefined);

        try {
            const watcher = watch(repoPath, { recursive: true }, (_event, filename) => {
                if (filename && shouldIgnore(`${repoPath}/${filename}`, repoPath)) return;
                this.handleFileChange(sessionId, repoPath);
            });

            watcher.on('error', (err) => {
                console.error(`[watcher] fs.watch error for session ${sessionId}:`, err);
            });

            const active: ActiveWatcher = {
                watcher,
                sessionId,
                repoPath,
                debounceTimer: null,
                lastSnapshotAt: 0,
            };
            this.activeWatchers[sessionId] = active;

            const dbResult = this.dbService.execute('UPDATE sessions SET is_watching = 1 WHERE id = $id', {
                $id: sessionId,
            });
            if (dbResult.isErr()) {
                watcher.close();
                delete this.activeWatchers[sessionId];
                return errAsync(dbResult.error);
            }

            this.sseService.broadcast(sessionId, {
                type: 'watcher-status',
                data: { session_id: sessionId, is_watching: true },
            });

            return okAsync(undefined);
        } catch (e) {
            return errAsync(watcherError('Failed to start file watcher', e));
        }
    }

    stopWatching(sessionId: string): ResultAsync<void, WatcherError | DatabaseError> {
        const active = this.activeWatchers[sessionId];

        if (active) {
            if (active.debounceTimer) clearTimeout(active.debounceTimer);
            active.watcher.close();
            delete this.activeWatchers[sessionId];
        }

        const dbResult = this.dbService.execute('UPDATE sessions SET is_watching = 0 WHERE id = $id', {
            $id: sessionId,
        });
        if (dbResult.isErr()) return errAsync(dbResult.error);

        this.sseService.broadcast(sessionId, {
            type: 'watcher-status',
            data: { session_id: sessionId, is_watching: false },
        });

        return okAsync(undefined);
    }

    captureSnapshot(
        sessionId: string,
        repoPath: string,
        trigger: SnapshotTrigger,
    ): ResultAsync<Snapshot, GitError | DatabaseError | NotFoundError> {
        const sessionResult = this.sessionService.getSession(sessionId);
        if (sessionResult.isErr()) return errAsync(sessionResult.error);

        const session = sessionResult.value;
        const baseBranch = session.base_branch ?? session.repo.base_branch;

        return this.gitService.getDiff(repoPath, baseBranch).andThen(({ rawDiff, files }) => {
            const prevResult = this.dbService.queryOne<SnapshotRow>(
                'SELECT id, session_id, raw_diff, files_summary, head_commit, trigger, changed_files, has_review_comments, created_at FROM snapshots WHERE session_id = $sessionId ORDER BY created_at DESC LIMIT 1',
                { $sessionId: sessionId },
            );
            if (prevResult.isErr()) return errAsync(prevResult.error);

            const previousFiles: FileSummary[] = prevResult.value ? JSON.parse(prevResult.value.files_summary) : [];
            const previousRawDiff = prevResult.value?.raw_diff ?? '';

            const changedFiles = computeChangedFiles(files, previousFiles, rawDiff, previousRawDiff);

            return this.gitService.getHeadCommit(repoPath).andThen((headCommit) => {
                // Skip snapshot if HEAD hasn't changed since last snapshot
                if (prevResult.value && prevResult.value.head_commit === headCommit) {
                    const prev = prevResult.value;
                    return okAsync({
                        id: prev.id,
                        session_id: prev.session_id,
                        raw_diff: prev.raw_diff,
                        files_summary: JSON.parse(prev.files_summary) as FileSummary[],
                        head_commit: prev.head_commit,
                        trigger: prev.trigger as SnapshotTrigger,
                        changed_files: prev.changed_files ? JSON.parse(prev.changed_files) : null,
                        has_review_comments: Boolean(prev.has_review_comments),
                        created_at: prev.created_at,
                    } satisfies Snapshot);
                }

                const snapshotId = generateId();

                const insertResult = this.dbService.execute(
                    `INSERT INTO snapshots (id, session_id, raw_diff, files_summary, head_commit, trigger, changed_files, has_review_comments)
					 VALUES ($id, $sessionId, $rawDiff, $filesSummary, $headCommit, $trigger, $changedFiles, 0)`,
                    {
                        $id: snapshotId,
                        $sessionId: sessionId,
                        $rawDiff: rawDiff,
                        $filesSummary: JSON.stringify(files),
                        $headCommit: headCommit,
                        $trigger: trigger,
                        $changedFiles: changedFiles.length > 0 ? JSON.stringify(changedFiles) : null,
                    },
                );
                if (insertResult.isErr()) return errAsync(insertResult.error);

                const snapshot: Snapshot = {
                    id: snapshotId,
                    session_id: sessionId,
                    raw_diff: rawDiff,
                    files_summary: files,
                    head_commit: headCommit,
                    trigger,
                    changed_files: changedFiles.length > 0 ? changedFiles : null,
                    has_review_comments: false,
                    created_at: new Date().toISOString(),
                };

                const { raw_diff: _, ...snapshotSummary }: Snapshot & { raw_diff: string } = snapshot;
                this.sseService.broadcast(sessionId, {
                    type: 'snapshot',
                    data: snapshotSummary,
                });

                return okAsync(snapshot);
            });
        });
    }

    isWatching(sessionId: string): boolean {
        return this.activeWatchers[sessionId] !== undefined;
    }

    stopAll(): void {
        for (const active of Object.values(this.activeWatchers)) {
            if (active.debounceTimer) clearTimeout(active.debounceTimer);
            active.watcher.close();
        }
        this.activeWatchers = {};
    }

    private handleFileChange(sessionId: string, repoPath: string): void {
        const active = this.activeWatchers[sessionId];
        if (!active) return;

        if (active.debounceTimer) clearTimeout(active.debounceTimer);

        active.debounceTimer = setTimeout(() => {
            const now = Date.now();
            const elapsed = now - active.lastSnapshotAt;
            if (elapsed < MIN_SNAPSHOT_GAP_MS) {
                const remaining = MIN_SNAPSHOT_GAP_MS - elapsed;
                active.debounceTimer = setTimeout(() => {
                    this.executeSnapshot(sessionId, repoPath, active);
                }, remaining);
            } else {
                this.executeSnapshot(sessionId, repoPath, active);
            }
        }, DEBOUNCE_MS);
    }

    private executeSnapshot(sessionId: string, repoPath: string, active: ActiveWatcher): void {
        active.debounceTimer = null;
        this.captureSnapshot(sessionId, repoPath, 'fs_watch').match(
            () => {
                active.lastSnapshotAt = Date.now();
            },
            (error) => {
                console.error('[watcher] snapshot failed:', error);
            },
        );
    }
}
