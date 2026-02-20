import type { CommentThread } from '@agent-code-reviewer/shared';
import { SlicePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    afterNextRender,
    computed,
    effect,
    inject,
    input,
    signal,
    viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { CommentStore } from '../../../core/stores/comment-store';
import { CommentListItem } from '../comment-panel/comment-list-item';

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    for (const item of items) {
        const key = keyFn(item);
        (result[key] ??= []).push(item);
    }
    return result;
}

@Component({
    selector: 'acr-comment-history',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommentListItem, SlicePipe, RouterLink, NgIcon],
    host: { class: 'flex flex-col h-full overflow-hidden' },
    template: `
        <header class="flex items-center gap-3 px-4 py-2 border-b border-base-300">
            <a class="btn btn-xs btn-ghost" [routerLink]="['/review', sessionId()]">
                <ng-icon name="lucideArrowLeft" class="size-4" />
                Back to review
            </a>
            <h1 class="text-lg font-bold flex-1">Comment History</h1>
            @if (totalUnresolved() > 0) {
                <button class="btn btn-xs btn-warning" (click)="showGlobalConfirm()">
                    <ng-icon name="lucideCheckCheck" class="size-3" />
                    Resolve all ({{ totalUnresolved() }})
                </button>
            }
        </header>

        <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300">
            <span class="text-xs font-semibold">Filter:</span>
            <button
                class="btn btn-xs"
                [class.btn-active]="filter() === 'all'"
                (click)="filter.set('all')"
            >All</button>
            <button
                class="btn btn-xs"
                [class.btn-active]="filter() === 'unresolved'"
                (click)="filter.set('unresolved')"
            >Unresolved</button>
            <button
                class="btn btn-xs"
                [class.btn-active]="filter() === 'resolved'"
                (click)="filter.set('resolved')"
            >Resolved</button>
        </div>

        <div class="flex-1 overflow-auto p-4 space-y-4">
            @if (snapshotGroups().length === 0) {
                <div class="text-center text-base-content/50 p-8">No comments for this session</div>
            } @else {
                @for (group of snapshotGroups(); track group.snapshotId) {
                    <div #snapshotGroup [attr.data-snapshot-id]="group.snapshotId" class="card bg-base-100 shadow-sm">
                        <div class="card-body p-3">
                            <div class="flex items-center gap-2">
                                <span class="badge badge-neutral font-mono" [title]="group.snapshotId">{{ group.snapshotId | slice:0:8 }}</span>
                                <span class="text-xs opacity-50 flex-1">{{ group.comments.length }} comments</span>
                                @if (group.unresolvedCount > 0) {
                                    <button
                                        class="btn btn-xs btn-ghost"
                                        (click)="showSnapshotConfirm(group.snapshotId, group.unresolvedCount)"
                                    >
                                        <ng-icon name="lucideCheckCheck" class="size-3" />
                                        Resolve {{ group.unresolvedCount }}
                                    </button>
                                }
                                <a
                                    class="btn btn-xs btn-ghost"
                                    [routerLink]="['/review', sessionId()]"
                                    [queryParams]="{ snapshot: group.snapshotId }"
                                >
                                    <ng-icon name="lucideExternalLink" class="size-3" />
                                    View
                                </a>
                            </div>

                            <div class="space-y-1 mt-2">
                                @for (thread of group.comments; track thread.comment.id) {
                                    <acr-comment-list-item
                                        [thread]="thread"
                                        [showActions]="true"
                                        (commentClicked)="onCommentClicked(group.snapshotId, $event)"
                                        (commentResolved)="onResolve($event)"
                                    />
                                }
                            </div>
                        </div>
                    </div>
                }
            }
        </div>

        <!-- Confirmation dialog -->
        @if (confirmState(); as confirm) {
            <div class="modal modal-open">
                <div class="modal-box">
                    <h3 class="font-bold text-lg">Confirm Bulk Resolve</h3>
                    <p class="py-4">Resolve {{ confirm.count }} comments? This cannot be undone.</p>
                    <div class="modal-action">
                        <button class="btn btn-ghost" (click)="confirmState.set(null)">Cancel</button>
                        <button class="btn btn-warning" (click)="executeBulkResolve()">Resolve</button>
                    </div>
                </div>
                <div class="modal-backdrop" (click)="confirmState.set(null)"></div>
            </div>
        }
    `,
})
export class CommentHistory {
    readonly sessionId = input.required<string>();
    readonly snapshot = input<string>();

    readonly #commentStore = inject(CommentStore);
    readonly #router = inject(Router);
    readonly snapshotGroupEls = viewChildren<ElementRef<HTMLElement>>('snapshotGroup');

    protected readonly filter = signal<'all' | 'unresolved' | 'resolved'>('all');
    protected readonly confirmState = signal<{ snapshotId?: string; count: number } | null>(null);

    protected readonly filteredComments = computed(() => {
        const all = this.#commentStore.comments();
        const f = this.filter();
        if (f === 'unresolved') return all.filter((t) => t.comment.status === 'sent');
        if (f === 'resolved') return all.filter((t) => t.comment.status === 'resolved');
        return all.filter((t) => t.comment.status !== 'draft');
    });

    protected readonly snapshotGroups = computed(() => {
        const grouped = groupBy(this.filteredComments(), (t) => t.comment.snapshot_id);
        return Object.entries(grouped)
            .map(([snapshotId, comments]) => ({
                snapshotId,
                comments,
                unresolvedCount: comments.filter((t) => t.comment.status === 'sent').length,
            }))
            .sort((a, b) => b.snapshotId.localeCompare(a.snapshotId));
    });

    protected readonly totalUnresolved = computed(
        () => this.#commentStore.comments().filter((t) => t.comment.status === 'sent').length,
    );

    constructor() {
        effect(() => {
            const sessionId = this.sessionId();
            if (sessionId) {
                this.#commentStore.loadComments({ session_id: sessionId });
            }
        });

        // Auto-scroll to snapshot group when specified via query param
        effect(() => {
            const snapId = this.snapshot();
            const groups = this.snapshotGroupEls();
            if (snapId && groups.length > 0) {
                const el = groups.find((g) => g.nativeElement.getAttribute('data-snapshot-id') === snapId);
                if (el) {
                    el.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    }

    protected showGlobalConfirm(): void {
        this.confirmState.set({ count: this.totalUnresolved() });
    }

    protected showSnapshotConfirm(snapshotId: string, count: number): void {
        this.confirmState.set({ snapshotId, count });
    }

    protected executeBulkResolve(): void {
        const state = this.confirmState();
        if (!state) return;
        this.#commentStore.bulkResolve({
            session_id: this.sessionId(),
            snapshot_id: state.snapshotId,
        });
        this.confirmState.set(null);
    }

    protected onCommentClicked(snapshotId: string, event: { filePath: string; lineStart: number | null; side: string }): void {
        this.#router.navigate(['/review', this.sessionId()], {
            queryParams: { snapshot: snapshotId },
        });
    }

    protected onResolve(thread: CommentThread): void {
        this.#commentStore.resolveComment(thread.comment.id);
    }
}
