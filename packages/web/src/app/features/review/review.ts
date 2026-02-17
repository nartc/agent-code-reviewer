import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { SessionStore } from '../../core/stores/session-store';
import { ResizeHandle } from '../../shared/components/resize-handle';
import { DiffViewer } from './diff-viewer/diff-viewer';
import { FileExplorer } from './file-explorer/file-explorer';
import { SessionSidebar } from './session-sidebar/session-sidebar';

@Component({
    selector: 'acr-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col flex-1 overflow-hidden' },
    imports: [ResizeHandle, DiffViewer, FileExplorer, SessionSidebar],
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
                    <div class="p-2 text-xs opacity-50">Comments panel — Phase 11</div>
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
}
