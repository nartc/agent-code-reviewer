import {
	type DatabaseError,
	type FileSummary,
	type GitError,
	type NotFoundError,
	type Snapshot,
	type SnapshotSummary,
	type SnapshotTrigger,
	type WatcherError,
	generateId,
	watcherError,
} from '@agent-code-reviewer/shared';
import type { Stats } from 'node:fs';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { FSWatcher } from 'chokidar';
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

function createIgnoreFunction(): (path: string, stats?: Stats) => boolean {
	const ignoredDirs = new Set([
		'node_modules', '.git', 'dist', 'build', '.next',
		'.cache', 'coverage', '__pycache__', '.venv',
	]);
	const ignoredFiles = new Set(['.DS_Store']);

	return (filePath: string, _stats?: Stats): boolean => {
		const segments = filePath.split('/');
		for (const segment of segments) {
			if (ignoredDirs.has(segment)) return true;
			if (ignoredFiles.has(segment)) return true;
		}
		return false;
	};
}

function computeChangedFiles(current: FileSummary[], previous: FileSummary[]): string[] {
	if (previous.length === 0) return [];

	const changed: string[] = [];
	const previousMap: Record<string, FileSummary> = {};
	for (const file of previous) {
		previousMap[file.path] = file;
	}

	const currentPaths = new Set<string>();
	for (const file of current) {
		currentPaths.add(file.path);
		const prev = previousMap[file.path];
		if (!prev) {
			changed.push(file.path);
		} else if (
			prev.additions !== file.additions ||
			prev.deletions !== file.deletions ||
			prev.status !== file.status
		) {
			changed.push(file.path);
		}
	}

	for (const file of previous) {
		if (!currentPaths.has(file.path)) {
			changed.push(file.path);
		}
	}

	return changed;
}

export { createIgnoreFunction, computeChangedFiles };

export class WatcherService {
	private activeWatchers: Record<string, ActiveWatcher> = {};

	constructor(
		private dbService: DbService,
		private gitService: GitService,
		private sessionService: SessionService,
		private sseService: SseService,
	) {}

	startWatching(sessionId: string, repoPath: string): ResultAsync<void, WatcherError | DatabaseError | NotFoundError> {
		const sessionResult = this.sessionService.getSession(sessionId);
		if (sessionResult.isErr()) return errAsync(sessionResult.error);

		if (this.activeWatchers[sessionId]) return okAsync(undefined);

		return ResultAsync.fromPromise(
			import('chokidar').then(({ watch }) => {
				const watcher = watch(repoPath, {
					ignored: createIgnoreFunction(),
					ignoreInitial: true,
					persistent: true,
				});

				watcher.on('all', () => {
					this.handleFileChange(sessionId, repoPath);
				});

				const active: ActiveWatcher = {
					watcher,
					sessionId,
					repoPath,
					debounceTimer: null,
					lastSnapshotAt: 0,
				};
				this.activeWatchers[sessionId] = active;

				const dbResult = this.dbService.execute(
					'UPDATE sessions SET is_watching = 1 WHERE id = $id',
					{ $id: sessionId },
				);
				if (dbResult.isErr()) {
					watcher.close();
					delete this.activeWatchers[sessionId];
					throw dbResult.error;
				}

				this.sseService.broadcast(sessionId, {
					type: 'watcher-status',
					data: { session_id: sessionId, is_watching: true },
				});
			}),
			(e) => watcherError('Failed to start file watcher', e),
		);
	}

	stopWatching(sessionId: string): ResultAsync<void, WatcherError | DatabaseError> {
		const active = this.activeWatchers[sessionId];
		if (!active) return okAsync(undefined);

		return ResultAsync.fromPromise(
			active.watcher.close(),
			(e) => watcherError('Failed to stop file watcher', e),
		).andThen(() => {
			if (active.debounceTimer) clearTimeout(active.debounceTimer);
			delete this.activeWatchers[sessionId];

			const dbResult = this.dbService.execute(
				'UPDATE sessions SET is_watching = 0 WHERE id = $id',
				{ $id: sessionId },
			);
			if (dbResult.isErr()) return errAsync(dbResult.error);

			this.sseService.broadcast(sessionId, {
				type: 'watcher-status',
				data: { session_id: sessionId, is_watching: false },
			});

			return okAsync(undefined);
		});
	}

	captureSnapshot(sessionId: string, repoPath: string, trigger: SnapshotTrigger): ResultAsync<Snapshot, GitError | DatabaseError | NotFoundError> {
		const sessionResult = this.sessionService.getSession(sessionId);
		if (sessionResult.isErr()) return errAsync(sessionResult.error);

		const session = sessionResult.value;
		const baseBranch = session.base_branch ?? session.repo.base_branch;

		return this.gitService.getDiff(repoPath, baseBranch).andThen(({ rawDiff, files }) => {
			const prevResult = this.dbService.queryOne<SnapshotRow>(
				'SELECT id, files_summary, changed_files FROM snapshots WHERE session_id = $sessionId ORDER BY created_at DESC LIMIT 1',
				{ $sessionId: sessionId },
			);
			if (prevResult.isErr()) return errAsync(prevResult.error);

			const previousFiles: FileSummary[] = prevResult.value
				? JSON.parse(prevResult.value.files_summary)
				: [];

			const changedFiles = computeChangedFiles(files, previousFiles);

			return this.gitService.getHeadCommit(repoPath).andThen((headCommit) => {
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
					data: snapshotSummary as SnapshotSummary,
				});

				return okAsync(snapshot);
			});
		});
	}

	isWatching(sessionId: string): boolean {
		return this.activeWatchers[sessionId] !== undefined;
	}

	async stopAll(): Promise<void> {
		const closePromises: Promise<void>[] = [];
		for (const active of Object.values(this.activeWatchers)) {
			if (active.debounceTimer) clearTimeout(active.debounceTimer);
			closePromises.push(active.watcher.close());
		}
		await Promise.all(closePromises);
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
		this.captureSnapshot(sessionId, repoPath, 'fs_watch')
			.match(
				() => { active.lastSnapshotAt = Date.now(); },
				(error) => { console.error('[watcher] snapshot failed:', error); },
			);
	}
}
