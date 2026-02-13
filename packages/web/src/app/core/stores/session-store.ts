import { DestroyRef, Injectable, computed, inject } from '@angular/core';
import { signalState, patchState } from '@ngrx/signals';
import type { SessionWithRepo, SnapshotSummary, Snapshot, FileSummary } from '@agent-code-reviewer/shared';
import { ApiClient } from '../services/api-client';
import { SseConnection } from '../services/sse-connection';

@Injectable({ providedIn: 'root' })
export class SessionStore {
    readonly #api = inject(ApiClient);
    readonly #sse = inject(SseConnection);
    readonly #destroyRef = inject(DestroyRef);

    readonly #state = signalState({
        currentSession: null as SessionWithRepo | null,
        snapshots: [] as SnapshotSummary[],
        activeSnapshotId: null as string | null,
        currentDiff: null as Snapshot | null,
        files: [] as FileSummary[],
        activeFileIndex: 0,
        isLoading: false,
    });

    readonly currentSession = this.#state.currentSession;
    readonly snapshots = this.#state.snapshots;
    readonly activeSnapshotId = this.#state.activeSnapshotId;
    readonly currentDiff = this.#state.currentDiff;
    readonly files = this.#state.files;
    readonly activeFileIndex = this.#state.activeFileIndex;
    readonly isLoading = this.#state.isLoading;

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

    loadSession(id: string): void {
        patchState(this.#state, { isLoading: true });

        this.#api.getSession(id).subscribe({
            next: ({ session }) => {
                patchState(this.#state, { currentSession: session });
            },
        });

        this.#api.listSnapshots(id).subscribe({
            next: ({ snapshots }) => {
                const activeId = snapshots.length > 0 ? snapshots[0].id : null;
                patchState(this.#state, { snapshots, activeSnapshotId: activeId, isLoading: false });
                if (activeId) {
                    this.loadSnapshotDiff(activeId);
                }
            },
            error: () => {
                patchState(this.#state, { isLoading: false });
            },
        });

        const sse$ = this.#sse.connect(id);
        const sub = sse$.subscribe((event) => {
            if (event.type === 'snapshot') {
                const wasViewingLatest = this.isViewingLatest();
                patchState(this.#state, (s) => ({
                    snapshots: [event.data, ...s.snapshots],
                }));
                if (wasViewingLatest) {
                    patchState(this.#state, { activeSnapshotId: event.data.id });
                    this.loadSnapshotDiff(event.data.id);
                }
            }
        });

        this.#destroyRef.onDestroy(() => {
            sub.unsubscribe();
            this.#sse.disconnect();
        });
    }

    loadSnapshotDiff(snapshotId: string): void {
        this.#api.getSnapshotDiff(snapshotId).subscribe({
            next: ({ snapshot }) => {
                patchState(this.#state, {
                    currentDiff: snapshot,
                    files: snapshot.files_summary,
                    activeFileIndex: 0,
                });
            },
        });
    }

    setActiveSnapshot(snapshotId: string): void {
        patchState(this.#state, { activeSnapshotId: snapshotId });
        this.loadSnapshotDiff(snapshotId);
    }

    nextFile(): void {
        const len = this.files().length;
        if (len === 0) return;
        patchState(this.#state, (s) => ({
            activeFileIndex: (s.activeFileIndex + 1) % len,
        }));
    }

    prevFile(): void {
        const len = this.files().length;
        if (len === 0) return;
        patchState(this.#state, (s) => ({
            activeFileIndex: (s.activeFileIndex - 1 + len) % len,
        }));
    }

    setActiveFile(index: number): void {
        const len = this.files().length;
        if (len === 0) return;
        const clamped = Math.max(0, Math.min(index, len - 1));
        patchState(this.#state, { activeFileIndex: clamped });
    }

    jumpToLatest(): void {
        const snaps = this.snapshots();
        if (snaps.length === 0) return;
        this.setActiveSnapshot(snaps[0].id);
    }
}
