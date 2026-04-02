import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
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
import { TransportPicker } from './transport-picker/transport-picker';

@Component({
    selector: 'acr-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'flex flex-col flex-1 overflow-hidden',
        '(document:keydown.ArrowLeft)': 'onKeyPrev($event)',
        '(document:keydown.ArrowRight)': 'onKeyNext($event)',
    },
    imports: [
        ResizeHandle,
        DiffViewer,
        FileExplorer,
        SessionSidebar,
        CommentPanel,
        SnapshotTimeline,
        TransportPicker,
        NgIcon,
    ],
    template: `
        @let session = store.currentSession();
        @if (session) {
            <header class="flex items-center gap-3 px-4 py-2 border-b border-base-300">
                <h1 class="text-lg font-bold">{{ session.repo.name }}</h1>
                <span class="badge badge-neutral badge-sm">{{ session.branch }}</span>
                <span class="badge badge-sm" [class.badge-success]="!isCompleted()" [class.badge-ghost]="isCompleted()">
                    {{ isCompleted() ? 'completed' : 'active' }}
                </span>
                <span class="text-xs opacity-50 font-mono truncate flex-1">{{ session.repo.path }}</span>
                <span
                    class="badge badge-xs"
                    [class.badge-success]="store.isConnected()"
                    [class.badge-error]="!store.isConnected()"
                ></span>
                <button
                    class="btn btn-xs"
                    [class.btn-primary]="!isWatching()"
                    [class.btn-ghost]="isWatching()"
                    [disabled]="isCompleted()"
                    (click)="toggleWatcher()"
                >
                    <ng-icon [name]="isWatching() ? 'lucideEyeOff' : 'lucideEye'" class="size-3.5" />
                    {{ isWatching() ? 'Stop Monitoring' : 'Monitor Commits' }}
                </button>
                <button
                    class="btn btn-xs btn-ghost"
                    title="Capture snapshot"
                    [disabled]="isCompleted()"
                    (click)="refreshSnapshots()"
                >
                    <ng-icon name="lucideRefreshCw" class="size-3.5" />
                </button>
                @if (!isCompleted()) {
                    <button class="btn btn-xs btn-warning" (click)="openCompleteDialog()">
                        <ng-icon name="lucideCheckCheck" class="size-3.5" />
                        Complete Session
                    </button>
                }
            </header>

            <acr-snapshot-timeline
                [snapshots]="store.snapshots()"
                [activeSnapshotId]="store.activeSnapshotId()"
                [hasNewChanges]="store.hasNewChanges()"
                (snapshotSelected)="onSnapshotSelected($event)"
                (jumpToLatest)="onJumpToLatest()"
            />

            <div class="flex flex-1 overflow-hidden">
                <!-- Left sidebar -->
                @if (sidebarCollapsed()) {
                    <div class="flex flex-col items-center border-r border-base-300 py-2 w-10">
                        <button
                            class="btn btn-xs btn-ghost"
                            title="Expand sidebar"
                            aria-expanded="false"
                            (click)="toggleSidebar()"
                        >
                            <ng-icon name="lucideChevronsRight" class="size-4" />
                        </button>
                    </div>
                } @else {
                    <div class="flex flex-col overflow-auto" [style.width.px]="leftWidth()">
                        <div class="flex items-center justify-between px-2 py-1 border-b border-base-300">
                            <span class="text-xs font-semibold opacity-70">Sessions</span>
                            <button
                                class="btn btn-xs btn-ghost"
                                title="Collapse sidebar"
                                aria-expanded="true"
                                (click)="toggleSidebar()"
                            >
                                <ng-icon name="lucideChevronsLeft" class="size-4" />
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
                                    [changedFiles]="store.changedFiles()"
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
                        <acr-transport-picker />
                        <acr-comment-panel
                            [sessionId]="sessionId()"
                            [snapshotId]="snapId"
                            [canSend]="canSend()"
                            [canMutate]="canMutate()"
                            (sendRequested)="onSendComments($event)"
                            (commentClicked)="onCommentClicked($event)"
                        />
                    }
                </div>
            </div>

            @if (showCompleteModal()) {
                <div class="modal modal-open">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg">Complete session?</h3>
                        <p class="py-2 text-sm opacity-70">
                            Completed sessions become read-only. You can still view all snapshots and comments.
                        </p>

                        @if (completionBlockers(); as blockers) {
                            <div class="alert alert-warning text-sm my-2">
                                <div>
                                    <p>Completion blocked:</p>
                                    <ul class="list-disc ml-5">
                                        @if (blockers.draft_count > 0) {
                                            <li>{{ blockers.draft_count }} draft comment(s)</li>
                                        }
                                        @if (blockers.unresolved_sent_count > 0) {
                                            <li>{{ blockers.unresolved_sent_count }} unresolved comment thread(s)</li>
                                        }
                                        @if (blockers.watcher_active) {
                                            <li>watcher is still active</li>
                                        }
                                    </ul>
                                </div>
                            </div>
                        }

                        <label class="label" for="completion-reason">
                            <span class="label-text">Reason (optional)</span>
                        </label>
                        <textarea
                            id="completion-reason"
                            class="textarea textarea-bordered w-full"
                            rows="3"
                            placeholder="e.g. all feedback addressed"
                            [value]="completionReason()"
                            (input)="completionReason.set($any($event.target).value)"
                        ></textarea>

                        <div class="modal-action">
                            <button class="btn btn-ghost" (click)="closeCompleteDialog()">Cancel</button>
                            @if (completionBlockers()) {
                                <button
                                    class="btn btn-error"
                                    [disabled]="isCompleting()"
                                    (click)="completeSession(true)"
                                >
                                    Force Complete
                                </button>
                            } @else {
                                <button
                                    class="btn btn-warning"
                                    [disabled]="isCompleting()"
                                    (click)="completeSession(false)"
                                >
                                    Complete
                                </button>
                            }
                        </div>
                    </div>
                    <div class="modal-backdrop" (click)="closeCompleteDialog()"></div>
                </div>
            }

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
    readonly snapshot = input<string>();

    protected readonly leftWidth = this.#prefs.panelLeftWidth;
    protected readonly rightWidth = this.#prefs.panelRightWidth;
    protected readonly sidebarCollapsed = this.#prefs.sidebarCollapsed;
    protected readonly isWatching = this.store.isWatching;
    protected readonly isCompleted = this.store.isCompleted;
    protected readonly isSending = signal(false);
    protected readonly isCompleting = signal(false);
    protected readonly showCompleteModal = signal(false);
    protected readonly completionReason = signal('');
    protected readonly completionBlockers = signal<{
        draft_count: number;
        unresolved_sent_count: number;
        watcher_active: boolean;
    } | null>(null);
    protected readonly toastMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
    protected readonly canMutate = computed(() => !this.isCompleted());

    protected readonly canSend = () =>
        !!this.#transportStore.activeTransport() &&
        !!this.#transportStore.lastTargetId() &&
        !this.isSending() &&
        !this.isCompleted();

    constructor() {
        effect(() => {
            this.store.loadSession(this.sessionId(), this.snapshot());
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

    protected onKeyPrev(event: Event): void {
        if (this.#isInputFocused(event)) return;
        this.store.prevFile();
    }

    protected onKeyNext(event: Event): void {
        if (this.#isInputFocused(event)) return;
        this.store.nextFile();
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

    protected refreshSnapshots(): void {
        if (this.isCompleted()) return;
        this.#api.captureSnapshot(this.sessionId()).subscribe({
            error: (err) => {
                console.error('Failed to capture snapshot:', err);
            },
        });
    }

    protected toggleWatcher(): void {
        if (this.isCompleted()) return;
        const id = this.sessionId();
        if (this.isWatching()) {
            this.#api.stopWatching(id).subscribe();
        } else {
            this.#api.startWatching(id).subscribe();
        }
    }

    protected openCompleteDialog(): void {
        if (this.isCompleted()) return;
        this.completionBlockers.set(null);
        this.showCompleteModal.set(true);
    }

    protected closeCompleteDialog(): void {
        if (this.isCompleting()) return;
        this.showCompleteModal.set(false);
        this.completionReason.set('');
        this.completionBlockers.set(null);
    }

    protected completeSession(force: boolean): void {
        if (this.isCompleted() || this.isCompleting()) return;

        this.isCompleting.set(true);
        const trimmedReason = this.completionReason().trim();

        this.#api
            .completeSession(this.sessionId(), {
                force,
                reason: trimmedReason.length > 0 ? trimmedReason : undefined,
            })
            .subscribe({
                next: () => {
                    this.isCompleting.set(false);
                    this.closeCompleteDialog();
                    this.showToast('success', force ? 'Session force-completed' : 'Session completed');
                },
                error: (err: unknown) => {
                    this.isCompleting.set(false);

                    if (err instanceof HttpErrorResponse && err.status === 409) {
                        const blockers = err.error?.blockers;
                        if (blockers) {
                            this.completionBlockers.set(blockers);
                            return;
                        }
                    }

                    this.showToast(
                        'error',
                        `Failed to complete session: ${err instanceof Error ? err.message : 'Unknown error'}`,
                    );
                },
            });
    }

    protected onJumpToLatest(): void {
        this.store.jumpToLatest();
        const snaps = this.store.snapshots();
        if (snaps.length > 0) {
            this.#router.navigate([], {
                queryParams: { snapshot: snaps[0].id },
                queryParamsHandling: 'merge',
                replaceUrl: true,
            });
        }
    }

    protected onSnapshotSelected(snapshotId: string): void {
        this.store.setActiveSnapshot(snapshotId);
        this.#router.navigate([], {
            queryParams: { snapshot: snapshotId },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }

    protected onCommentClicked(event: { filePath: string; lineStart: number | null; side: string }): void {
        this.store.navigateToComment(event.filePath, event.lineStart, event.side);
    }

    protected onSessionSelected(sessionId: string): void {
        this.#router.navigate(['/review', sessionId]);
    }

    protected onSendComments(commentIds: string[]): void {
        if (this.isCompleted()) return;
        const transport = this.#transportStore.activeTransport();
        const targetId = this.#transportStore.lastTargetId();
        if (!transport || !targetId) return;
        this.isSending.set(true);
        this.#commentStore.sendComments(
            {
                comment_ids: commentIds,
                transport_type: transport,
                target_id: targetId,
                snapshot_id: this.store.activeSnapshotId() ?? undefined,
            },
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

    #isInputFocused(event: Event): boolean {
        const tag = (event.target as HTMLElement).tagName;
        return (
            tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (event.target as HTMLElement).isContentEditable
        );
    }

    private showToast(type: 'success' | 'error', text: string): void {
        this.toastMessage.set({ type, text });
        setTimeout(() => this.toastMessage.set(null), 3000);
    }
}
