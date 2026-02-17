import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { CommentStore } from '../../core/stores/comment-store';
import { SessionStore } from '../../core/stores/session-store';
import { TransportStore } from '../../core/stores/transport-store';
import { ResizeHandle } from '../../shared/components/resize-handle';
import { CommentPanel } from './comment-panel/comment-panel';
import { DiffViewer } from './diff-viewer/diff-viewer';
import { FileExplorer } from './file-explorer/file-explorer';
import { SessionSidebar } from './session-sidebar/session-sidebar';

@Component({
    selector: 'acr-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col flex-1 overflow-hidden' },
    imports: [ResizeHandle, DiffViewer, FileExplorer, SessionSidebar, CommentPanel],
    template: `
        @let session = store.currentSession();
        @if (session) {
            <header class="flex items-center gap-3 px-4 py-2 border-b border-base-300">
                <h1 class="text-lg font-bold">{{ session.repo.name }}</h1>
                <span class="badge badge-neutral badge-sm">{{ session.branch }}</span>
                <span class="text-xs opacity-50 font-mono truncate flex-1">{{ session.repo_path.path }}</span>
                <span
                    class="badge badge-xs"
                    [class.badge-success]="store.isConnected()"
                    [class.badge-error]="!store.isConnected()"
                ></span>
                <button
                    class="btn btn-xs"
                    [class.btn-primary]="!isWatching()"
                    [class.btn-ghost]="isWatching()"
                    (click)="toggleWatcher()"
                >
                    {{ isWatching() ? 'Stop Watching' : 'Start Watching' }}
                </button>
            </header>

            <div class="flex flex-1 overflow-hidden">
                <!-- Left sidebar -->
                <div class="flex flex-col overflow-auto" [style.width.px]="leftWidth()">
                    <acr-session-sidebar
                        [repoId]="session.repo_id"
                        [currentSessionId]="sessionId()"
                        (sessionSelected)="onSessionSelected($event)"
                    />
                    @if (store.files().length > 0) {
                        <div class="border-t border-base-300">
                            <div class="p-2 text-xs font-semibold opacity-70">Files</div>
                            <acr-file-explorer
                                [files]="store.files()"
                                [activeFileIndex]="store.activeFileIndex()"
                                (fileSelected)="store.setActiveFile($event)"
                            />
                        </div>
                    }
                </div>

                <acr-resize-handle direction="horizontal" (resized)="onLeftResize($event)" />

                <!-- Center diff -->
                <acr-diff-viewer class="flex flex-col flex-1 overflow-hidden" />

                <acr-resize-handle direction="horizontal" (resized)="onRightResize($event)" />

                <!-- Right panel -->
                <div class="flex flex-col overflow-auto" [style.width.px]="rightWidth()">
                    @if (store.activeSnapshotId(); as snapId) {
                        <acr-comment-panel
                            [sessionId]="sessionId()"
                            [snapshotId]="snapId"
                            (sendRequested)="onSendComments($event)"
                        />
                    }
                </div>
            </div>
        } @else if (store.sessionError()) {
            <p class="p-4 text-error">Session not found.</p>
        } @else {
            <div class="flex justify-center py-12">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        }
    `,
})
export class Review {
    protected readonly store = inject(SessionStore);
    readonly #api = inject(ApiClient);
    readonly #router = inject(Router);
    readonly #commentStore = inject(CommentStore);
    readonly #transportStore = inject(TransportStore);
    readonly sessionId = input.required<string>();

    protected readonly leftWidth = signal(250);
    protected readonly rightWidth = signal(300);
    protected readonly isWatching = signal(false);

    constructor() {
        effect(() => {
            this.store.loadSession(this.sessionId());
        });

        effect(() => {
            this.isWatching.set(this.store.isWatching());
        });

        // Load comments when snapshot changes
        effect(() => {
            const snapId = this.store.activeSnapshotId();
            const sessionId = this.sessionId();
            if (snapId) {
                this.#commentStore.loadComments({ session_id: sessionId });
            }
        });
    }

    protected onLeftResize(delta: number): void {
        this.leftWidth.update((w) => Math.max(200, Math.min(400, w + delta)));
    }

    protected onRightResize(delta: number): void {
        this.rightWidth.update((w) => Math.max(250, Math.min(500, w - delta)));
    }

    protected toggleWatcher(): void {
        const id = this.sessionId();
        if (this.isWatching()) {
            this.#api.stopWatching(id).subscribe({
                next: () => this.isWatching.set(false),
            });
        } else {
            this.#api.startWatching(id).subscribe({
                next: () => this.isWatching.set(true),
            });
        }
    }

    protected onSessionSelected(sessionId: string): void {
        this.#router.navigate(['/review', sessionId]);
    }

    protected onSendComments(commentIds: string[]): void {
        const transport = this.#transportStore.activeTransport();
        const targetId = this.#transportStore.lastTargetId();
        if (!transport || !targetId) return;
        this.#commentStore.sendComments({ comment_ids: commentIds, transport_type: transport, target_id: targetId });
    }
}
