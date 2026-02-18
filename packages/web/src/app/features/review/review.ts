import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { UiPreferences } from '../../core/services/ui-preferences';
import { CommentStore } from '../../core/stores/comment-store';
import { SessionStore } from '../../core/stores/session-store';
import { TransportStore } from '../../core/stores/transport-store';
import { ResizeHandle } from '../../shared/components/resize-handle';
import { CommentPanel } from './comment-panel/comment-panel';
import { DiffViewer } from './diff-viewer/diff-viewer';
import { FileExplorer } from './file-explorer/file-explorer';
import { SessionSidebar } from './session-sidebar/session-sidebar';
import { SnapshotTimeline } from './snapshot-timeline/snapshot-timeline';

@Component({
    selector: 'acr-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col flex-1 overflow-hidden' },
    imports: [ResizeHandle, DiffViewer, FileExplorer, SessionSidebar, CommentPanel, SnapshotTimeline],
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

            <acr-snapshot-timeline
                [snapshots]="store.snapshots()"
                [activeSnapshotId]="store.activeSnapshotId()"
                [hasNewChanges]="store.hasNewChanges()"
                (snapshotSelected)="store.setActiveSnapshot($event)"
                (jumpToLatest)="store.jumpToLatest()"
            />

            <div class="flex flex-1 overflow-hidden">
                <!-- Left sidebar -->
                @if (sidebarCollapsed()) {
                    <div class="flex flex-col items-center border-r border-base-300 py-2 w-10">
                        <button
                            class="btn btn-xs btn-ghost"
                            title="Expand sidebar"
                            (click)="toggleSidebar()"
                        >
                            &raquo;
                        </button>
                    </div>
                } @else {
                    <div class="flex flex-col overflow-auto" [style.width.px]="leftWidth()">
                        <div class="flex items-center justify-between px-2 py-1 border-b border-base-300">
                            <span class="text-xs font-semibold opacity-70">Sessions</span>
                            <button
                                class="btn btn-xs btn-ghost"
                                title="Collapse sidebar"
                                (click)="toggleSidebar()"
                            >
                                &laquo;
                            </button>
                        </div>
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
                }

                <!-- Center diff -->
                <acr-diff-viewer class="flex flex-col flex-1 overflow-hidden" />

                <acr-resize-handle direction="horizontal" (resized)="onRightResize($event)" />

                <!-- Right panel -->
                <div class="flex flex-col overflow-auto" [style.width.px]="rightWidth()">
                    @if (store.activeSnapshotId(); as snapId) {
                        <acr-comment-panel
                            [sessionId]="sessionId()"
                            [snapshotId]="snapId"
                            [canSend]="canSend()"
                            (sendRequested)="onSendComments($event)"
                        />
                    }
                </div>
            </div>

            @if (toastMessage(); as toast) {
                <div class="toast toast-end toast-bottom">
                    <div
                        class="alert"
                        [class.alert-success]="toast.type === 'success'"
                        [class.alert-error]="toast.type === 'error'"
                    >
                        <span>{{ toast.text }}</span>
                    </div>
                </div>
            }
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
    readonly #prefs = inject(UiPreferences);
    readonly sessionId = input.required<string>();

    protected readonly leftWidth = this.#prefs.panelLeftWidth;
    protected readonly rightWidth = this.#prefs.panelRightWidth;
    protected readonly sidebarCollapsed = this.#prefs.sidebarCollapsed;
    protected readonly isWatching = signal(false);
    protected readonly isSending = signal(false);
    protected readonly toastMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

    protected readonly canSend = () =>
        !!this.#transportStore.activeTransport() && !!this.#transportStore.lastTargetId() && !this.isSending();

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

    protected toggleSidebar(): void {
        this.#prefs.setSidebarCollapsed(!this.sidebarCollapsed());
    }

    protected onLeftResize(delta: number): void {
        const clamped = Math.max(200, Math.min(400, this.leftWidth() + delta));
        this.#prefs.setPanelLeftWidth(clamped);
    }

    protected onRightResize(delta: number): void {
        const clamped = Math.max(250, Math.min(500, this.rightWidth() - delta));
        this.#prefs.setPanelRightWidth(clamped);
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
        this.isSending.set(true);
        this.#commentStore.sendComments(
            { comment_ids: commentIds, transport_type: transport, target_id: targetId },
            {
                onSuccess: (res) => {
                    this.isSending.set(false);
                    if (transport === 'clipboard' && res.formatted_text) {
                        navigator.clipboard.writeText(res.formatted_text);
                    }
                    this.showToast('success', `Comments sent via ${transport}`);
                },
                onError: (err) => {
                    this.isSending.set(false);
                    this.showToast('error', `Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`);
                },
            },
        );
    }

    private showToast(type: 'success' | 'error', text: string): void {
        this.toastMessage.set({ type, text });
        setTimeout(() => this.toastMessage.set(null), 3000);
    }
}
