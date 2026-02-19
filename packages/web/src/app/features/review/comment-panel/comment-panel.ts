import type { CommentThread } from '@agent-code-reviewer/shared';
import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { CommentStore } from '../../../core/stores/comment-store';
import { SessionStore } from '../../../core/stores/session-store';
import { CommentListItem } from './comment-list-item';


function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    for (const item of items) {
        const key = keyFn(item);
        (result[key] ??= []).push(item);
    }
    return result;
}

@Component({
    selector: 'acr-comment-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommentListItem, KeyValuePipe, NgIcon, RouterLink],
    template: `
        <div class="flex flex-col h-full">
            @if (isViewingLatest()) {
                <!-- Latest snapshot layout -->
                <div class="flex items-center justify-between p-2 border-b border-base-300">
                    <h3 class="font-semibold text-sm">Comments</h3>
                    <button
                        class="btn btn-xs btn-primary"
                        title="Send all draft comments"
                        [disabled]="!hasDrafts() || !canSend()"
                        (click)="sendAllDrafts()"
                    >
                        <ng-icon name="lucideSend" class="size-3" />
                        Send All Drafts
                    </button>
                </div>

                <div class="flex-1 overflow-auto p-2">
                    @if (hasDrafts()) {
                        @for (group of draftsByFile() | keyvalue; track group.key) {
                            <div class="font-mono text-xs p-1 bg-base-200 rounded mt-2 first:mt-0">{{ group.key }}</div>
                            @for (thread of group.value; track thread.comment.id) {
                                <acr-comment-list-item
                                    class="block mt-1"
                                    [thread]="thread"
                                    [showActions]="true"
                                    [showFileHeader]="false"
                                    [showStatus]="false"
                                    (commentClicked)="onCommentClicked($event)"
                                    (commentDeleted)="onCommentDeletedFromListItem($event)"
                                />
                            }
                        }
                    } @else {
                        <div class="text-center text-base-content/50 p-4 text-sm">No draft comments</div>
                    }
                </div>

                <div class="p-2 border-t border-base-300">
                    <a
                        class="btn btn-xs btn-ghost w-full"
                        [routerLink]="['/review', sessionId(), 'comments']"
                    >
                        <ng-icon name="lucideHistory" class="size-3" />
                        View Comment History
                    </a>
                </div>
            } @else {
                <!-- Previous snapshot layout -->
                <div class="flex items-center justify-between p-2 border-b border-base-300">
                    <h3 class="font-semibold text-sm">Snapshot Comments</h3>
                    <a
                        class="link link-primary text-xs"
                        [routerLink]="['/review', sessionId(), 'comments']"
                        [queryParams]="{ snapshot: snapshotId() }"
                    >
                        View full history &rarr;
                    </a>
                </div>

                <div class="flex-1 overflow-auto p-2">
                    @if (snapshotComments().length > 0) {
                        @for (thread of snapshotComments(); track thread.comment.id) {
                            <acr-comment-list-item
                                class="block mt-1 first:mt-0"
                                [thread]="thread"
                                [showActions]="true"
                                (commentClicked)="onCommentClicked($event)"
                                (commentResolved)="onCommentResolvedFromListItem($event)"
                            />
                        }
                    } @else {
                        <div class="text-center text-base-content/50 p-4 text-sm">No comments for this snapshot</div>
                    }
                </div>

                @if (unresolvedCount() > 0) {
                    <div class="p-2 border-t border-base-300">
                        <button
                            class="btn btn-xs btn-ghost w-full"
                            (click)="markAllResolved()"
                        >
                            <ng-icon name="lucideCheckCheck" class="size-3" />
                            Mark all unresolved as resolved ({{ unresolvedCount() }})
                        </button>
                    </div>
                }
            }
        </div>
    `,
})
export class CommentPanel {
    readonly sessionId = input.required<string>();
    readonly snapshotId = input.required<string>();
    readonly canSend = input(true);

    readonly sendRequested = output<string[]>();
    readonly commentClicked = output<{ filePath: string; lineStart: number | null; side: string }>();

    readonly #commentStore = inject(CommentStore);
    readonly #sessionStore = inject(SessionStore);

    protected readonly isViewingLatest = this.#sessionStore.isViewingLatest;

    protected readonly draftsByFile = computed(() =>
        groupBy(this.#commentStore.draftComments(), (t) => t.comment.file_path),
    );

    protected readonly snapshotComments = computed(() => {
        const snapId = this.snapshotId();
        const sent = this.#commentStore.sentComments();
        const resolved = this.#commentStore.resolvedComments();
        return [...sent, ...resolved].filter((t) => t.comment.snapshot_id === snapId);
    });

    protected readonly unresolvedCount = computed(
        () => this.snapshotComments().filter((t) => t.comment.status === 'sent').length,
    );

    protected readonly hasDrafts = computed(() => this.#commentStore.draftComments().length > 0);

    protected sendAllDrafts(): void {
        const ids = this.#commentStore.draftComments().map((t) => t.comment.id);
        if (ids.length > 0) {
            this.sendRequested.emit(ids);
        }
    }

    protected onCommentClicked(event: { filePath: string; lineStart: number | null; side: string }): void {
        this.commentClicked.emit(event);
    }

    protected onCommentDeletedFromListItem(thread: CommentThread): void {
        this.#commentStore.deleteComment(thread.comment.id);
    }

    protected onCommentResolvedFromListItem(thread: CommentThread): void {
        this.#commentStore.resolveComment(thread.comment.id);
    }

    protected markAllResolved(): void {
        const unresolved = this.snapshotComments().filter((t) => t.comment.status === 'sent');
        for (const thread of unresolved) {
            this.#commentStore.resolveComment(thread.comment.id);
        }
    }
}
