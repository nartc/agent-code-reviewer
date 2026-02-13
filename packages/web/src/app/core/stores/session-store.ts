import { DestroyRef, Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { httpResource } from '@angular/common/http';
import { map } from 'rxjs';
import { signalState, patchState } from '@ngrx/signals';
import type { SessionWithRepo, SnapshotSummary, Snapshot, FileSummary, SnapshotDiffResponse } from '@agent-code-reviewer/shared';
import { ApiClient } from '../services/api-client';
import { SseConnection } from '../services/sse-connection';

@Injectable({ providedIn: 'root' })
export class SessionStore {
    readonly #api = inject(ApiClient);
    readonly #sse = inject(SseConnection);
    readonly #destroyRef = inject(DestroyRef);

    readonly #sessionId = signal<string | undefined>(undefined);

    readonly #sessionResource = rxResource<SessionWithRepo | null, string | undefined>({
        params: () => this.#sessionId(),
        stream: ({ params }) => this.#api.getSession(params).pipe(map((r) => r.session)),
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
        this.#sessionId.set(id);

        const sse$ = this.#sse.connect(id);
        const sub = sse$.subscribe((event) => {
            if (event.type === 'snapshot') {
                const wasViewingLatest = this.isViewingLatest();
                this.#snapshotsResource.update((snaps) => [event.data, ...snaps]);
                if (wasViewingLatest) {
                    this.#activeSnapshotId.set(event.data.id);
                }
            }
        });

        this.#destroyRef.onDestroy(() => {
            sub.unsubscribe();
            this.#sse.disconnect();
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
