import type { CommentThread } from '@agent-code-reviewer/shared';
import { KeyValuePipe, SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommentStore } from '../../../core/stores/comment-store';
import { AcrCommentThread } from './comment-thread';

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
    imports: [AcrCommentThread, KeyValuePipe, SlicePipe],
    template: `
        <div class="flex flex-col h-full">
            <div class="flex items-center justify-between p-2 border-b border-base-300">
                <h3 class="font-semibold text-sm">Comments</h3>
                <button
                    class="btn btn-xs btn-primary"
                    [disabled]="!hasDrafts() || !canSend()"
                    (click)="sendAllDrafts()"
                >
                    Send All Drafts
                </button>
            </div>

            <div role="tablist" class="tabs tabs-bordered px-2">
                <button
                    role="tab"
                    class="tab tab-sm"
                    [class.tab-active]="activeTab() === 'draft'"
                    (click)="activeTab.set('draft')"
                >
                    Drafts
                    @if (draftCount() > 0) {
                        <span class="badge badge-xs badge-warning ml-1">{{ draftCount() }}</span>
                    }
                </button>
                <button
                    role="tab"
                    class="tab tab-sm"
                    [class.tab-active]="activeTab() === 'history'"
                    (click)="activeTab.set('history')"
                >
                    History
                </button>
            </div>

            <div class="flex-1 overflow-auto p-2">
                @if (activeTab() === 'draft') {
                    @if (hasDrafts()) {
                        @for (group of draftsByFile() | keyvalue; track group.key) {
                            <div class="font-mono text-xs p-1 bg-base-200 rounded mt-2 first:mt-0">{{ group.key }}</div>
                            @for (thread of group.value; track thread.comment.id) {
                                <acr-comment-thread
                                    class="block mt-1"
                                    [thread]="thread"
                                    [sessionId]="sessionId()"
                                    (commentEdited)="onCommentEdited($event)"
                                    (commentDeleted)="onCommentDeleted($event)"
                                    (commentResolved)="onCommentResolved($event)"
                                    (replyCreated)="onReplyCreated($event)"
                                />
                            }
                        }
                    } @else {
                        <div class="text-center text-base-content/50 p-4 text-sm">No draft comments</div>
                    }
                } @else {
                    @if (hasHistory()) {
                        @for (group of historyBySnapshot() | keyvalue; track group.key) {
                            <div class="text-xs font-semibold p-1 bg-base-200 rounded mt-2 first:mt-0">
                                Snapshot: {{ group.key | slice:0:8 }}
                            </div>
                            @for (thread of group.value; track thread.comment.id) {
                                <acr-comment-thread
                                    class="block mt-1"
                                    [thread]="thread"
                                    [sessionId]="sessionId()"
                                    (commentEdited)="onCommentEdited($event)"
                                    (commentDeleted)="onCommentDeleted($event)"
                                    (commentResolved)="onCommentResolved($event)"
                                    (replyCreated)="onReplyCreated($event)"
                                />
                            }
                        }
                    } @else {
                        <div class="text-center text-base-content/50 p-4 text-sm">No comments yet</div>
                    }
                }
            </div>
        </div>
    `,
})
export class CommentPanel {
    readonly sessionId = input.required<string>();
    readonly snapshotId = input.required<string>();

    readonly canSend = input(true);

    readonly sendRequested = output<string[]>();

    readonly #commentStore = inject(CommentStore);

    protected readonly activeTab = signal<'draft' | 'history'>('draft');

    protected readonly draftsByFile = computed(() =>
        groupBy(this.#commentStore.draftComments(), (t) => t.comment.file_path),
    );

    protected readonly historyBySnapshot = computed(() => {
        const sent = this.#commentStore.sentComments();
        const resolved = this.#commentStore.resolvedComments();
        return groupBy([...sent, ...resolved], (t) => t.comment.snapshot_id);
    });

    protected readonly hasDrafts = computed(() => this.#commentStore.draftComments().length > 0);
    protected readonly hasHistory = computed(
        () => this.#commentStore.sentComments().length > 0 || this.#commentStore.resolvedComments().length > 0,
    );
    protected readonly draftCount = computed(() => this.#commentStore.draftComments().length);

    protected sendAllDrafts(): void {
        const ids = this.#commentStore.draftComments().map((t) => t.comment.id);
        if (ids.length > 0) {
            this.sendRequested.emit(ids);
        }
    }

    protected onCommentEdited(event: { id: string; content: string }): void {
        this.#commentStore.updateComment(event.id, { content: event.content });
    }

    protected onCommentDeleted(id: string): void {
        this.#commentStore.deleteComment(id);
    }

    protected onCommentResolved(id: string): void {
        this.#commentStore.resolveComment(id);
    }

    protected onReplyCreated(event: { parentId: string; content: string }): void {
        this.#commentStore.createReply(event.parentId, { content: event.content });
    }
}
