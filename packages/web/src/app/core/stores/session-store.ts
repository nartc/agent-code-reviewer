import type { FileSummary, SessionWithRepo, SnapshotDiffResponse, SnapshotSummary } from '@agent-code-reviewer/shared';
import { httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalState } from '@ngrx/signals';
import { map } from 'rxjs';
import { ApiClient } from '../services/api-client';
import { UiPreferences } from '../services/ui-preferences';
import { SseConnection } from '../services/sse-connection';
import { CommentStore } from './comment-store';

@Injectable({ providedIn: 'root' })
export class SessionStore {
    readonly #api = inject(ApiClient);
    readonly #sse = inject(SseConnection);
    readonly #commentStore = inject(CommentStore);
    readonly #prefs = inject(UiPreferences);
    readonly #destroyRef = inject(DestroyRef);
    readonly #pendingRestore = signal(false);

    readonly #sessionId = signal<string | undefined>(undefined);
    readonly #isConnected = signal(false);
    readonly #isWatching = signal(false);

    readonly #sessionResource = rxResource<SessionWithRepo | null, string | undefined>({
        params: () => this.#sessionId(),
        stream: ({ params }) => this.#api.getSession(params),
        defaultValue: null,
    });

    readonly #snapshotsResource = rxResource<SnapshotSummary[], string | undefined>({
        params: () => this.#sessionId(),
        stream: ({ params }) => this.#api.listSnapshots(params).pipe(map((r) => r.snapshots)),
        defaultValue: [],
    });

    readonly #activeSnapshotId = linkedSignal<string | null>(() => {
        const snaps = this.#snapshotsResource.value();
        return snaps.length > 0 ? snaps[0].id : null;
    });

    readonly #diffResource = httpResource<SnapshotDiffResponse>(() => {
        const snapId = this.#activeSnapshotId();
        return snapId ? `/api/snapshots/${snapId}/diff` : undefined;
    });

    readonly #nav = signalState({ activeFileIndex: 0 });

    readonly currentSession = this.#sessionResource.value;
    readonly snapshots = this.#snapshotsResource.value;
    readonly activeSnapshotId = this.#activeSnapshotId.asReadonly();
    readonly currentDiff = computed(() => this.#diffResource.value()?.snapshot ?? null);
    readonly files = computed<FileSummary[]>(() => this.currentDiff()?.files_summary ?? []);
    readonly activeFileIndex = this.#nav.activeFileIndex;
    readonly isLoading = computed(() => this.#sessionResource.isLoading() || this.#snapshotsResource.isLoading());
    readonly sessionError = this.#sessionResource.error;

    readonly activeSnapshot = computed(() => this.snapshots().find((s) => s.id === this.activeSnapshotId()) ?? null);

    readonly hasNewChanges = computed(() => {
        const snaps = this.snapshots();
        const activeId = this.activeSnapshotId();
        if (!snaps.length || !activeId) return false;
        return snaps[0].id !== activeId;
    });

    readonly isViewingLatest = computed(() => {
        const snaps = this.snapshots();
        return snaps.length > 0 && snaps[0].id === this.activeSnapshotId();
    });

    readonly activeFile = computed(() => this.files()[this.activeFileIndex()] ?? null);
    readonly totalFiles = computed(() => this.files().length);
    readonly isConnected = this.#isConnected.asReadonly();
    readonly isWatching = this.#isWatching.asReadonly();

    constructor() {
        // Restore file index on initial session load
        effect(() => {
            const files = this.files();
            const sessionId = this.#sessionId();
            if (this.#pendingRestore() && files.length > 0 && sessionId) {
                const stored = this.#prefs.getActiveFileIndex(sessionId);
                if (stored != null && stored < files.length) {
                    patchState(this.#nav, { activeFileIndex: stored });
                }
                this.#pendingRestore.set(false);
            }
        });

        // Persist file index on change (skip during restore to avoid overwriting stored value with 0)
        effect(() => {
            const sessionId = this.#sessionId();
            const index = this.activeFileIndex();
            if (sessionId != null && !this.#pendingRestore()) {
                this.#prefs.setActiveFileIndex(sessionId, index);
            }
        });
    }

    loadSession(id: string): void {
        this.#sessionId.set(id);
        this.#pendingRestore.set(true);
        this.#isConnected.set(false);

        const sse$ = this.#sse.connect(id);
        const sub = sse$.subscribe((event) => {
            if (event.type === 'connected') {
                this.#isConnected.set(true);
                // sync isWatching from loaded session
                const session = this.currentSession();
                if (session) {
                    this.#isWatching.set(session.is_watching);
                }
            } else if (event.type === 'snapshot') {
                const wasViewingLatest = this.isViewingLatest();
                this.#snapshotsResource.update((snaps) => [event.data, ...snaps]);
                if (wasViewingLatest) {
                    this.#activeSnapshotId.set(event.data.id);
                }
            } else if (event.type === 'comment-update') {
                this.#commentStore.onSseCommentUpdate(event.data.session_id);
            } else if (event.type === 'watcher-status') {
                this.#isWatching.set(event.data.is_watching);
            }
        });

        this.#destroyRef.onDestroy(() => {
            sub.unsubscribe();
            this.#sse.disconnect();
            this.#isConnected.set(false);
        });
    }

    setActiveSnapshot(snapshotId: string): void {
        this.#activeSnapshotId.set(snapshotId);
        patchState(this.#nav, { activeFileIndex: 0 });
    }

    nextFile(): void {
        const len = this.files().length;
        if (len === 0) return;
        patchState(this.#nav, (s) => ({
            activeFileIndex: (s.activeFileIndex + 1) % len,
        }));
    }

    prevFile(): void {
        const len = this.files().length;
        if (len === 0) return;
        patchState(this.#nav, (s) => ({
            activeFileIndex: (s.activeFileIndex - 1 + len) % len,
        }));
    }

    setActiveFile(index: number): void {
        const len = this.files().length;
        if (len === 0) return;
        const clamped = Math.max(0, Math.min(index, len - 1));
        patchState(this.#nav, { activeFileIndex: clamped });
    }

    jumpToLatest(): void {
        const snaps = this.snapshots();
        if (snaps.length === 0) return;
        this.setActiveSnapshot(snaps[0].id);
    }
}
