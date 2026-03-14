import type { Comment, CommentThread } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { CommentStore } from '../../../core/stores/comment-store';
import { RelativeTime } from '../../../shared/pipes/relative-time';

@Component({
    selector: 'acr-inline-comment',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTime, FormsModule, NgIcon],
    host: { class: 'flex flex-col bg-base-200 border border-base-300 rounded-lg p-2 my-1 text-sm font-mono max-h-80' },
    template: `
        @let c = thread().comment;

        <!-- Scrollable content area -->
        <div class="overflow-y-auto flex-1 min-h-0">
            <div class="flex items-center gap-2 text-xs mb-1">
                <ng-icon [name]="c.author === 'agent' ? 'lucideBot' : 'lucideUser'" class="size-3" />
                <span
                    class="badge badge-xs badge-outline"
                    [class.badge-primary]="c.author === 'user'"
                    [class.badge-accent]="c.author === 'agent'"
                >
                    {{ c.author }}
                </span>
                <span class="opacity-50">{{ c.created_at | relativeTime }}</span>
                @if (c.line_start != null) {
                    <span class="badge badge-xs badge-ghost">
                        L{{ c.line_start }}@if (c.line_end != null && c.line_end !== c.line_start) {-{{ c.line_end }}}
                    </span>
                }
                <span
                    class="badge badge-xs badge-outline"
                    [class.badge-warning]="c.status === 'draft'"
                    [class.badge-info]="c.status === 'sent'"
                    [class.badge-success]="c.status === 'resolved'"
                >
                    {{ c.status }}
                </span>
            </div>

            @if (editing()) {
                <textarea
                    class="textarea textarea-sm textarea-bordered w-full text-sm mt-1"
                    rows="4"
                    aria-label="Edit comment"
                    [value]="editContent()"
                    (input)="editContent.set($any($event.target).value)"
                ></textarea>
                <div class="flex justify-end gap-1 mt-1">
                    <button class="btn btn-xs btn-ghost" type="button" (click)="cancelEdit()">Cancel</button>
                    <button
                        class="btn btn-xs btn-primary"
                        type="button"
                        [disabled]="!editContent().trim()"
                        (click)="saveEdit()"
                    >
                        Save
                    </button>
                </div>
            } @else {
                <p class="whitespace-pre-wrap" [class.line-clamp-4]="!expanded()">
                    {{ c.content }}
                </p>

                @if (isLongContent()) {
                    <button class="btn btn-xs btn-ghost mt-1" (click)="toggleExpanded()">
                        {{ expanded() ? 'Show less' : 'Show more' }}
                    </button>
                }

                @if (thread().replies.length > 0) {
                    <div class="mt-1">
                        <button class="btn btn-xs btn-ghost" (click)="toggleReplies()">
                            {{ repliesExpanded() ? 'Hide' : 'Show' }} {{ thread().replies.length }} replies
                        </button>
                        @if (repliesExpanded()) {
                            <div class="ml-4 mt-1 space-y-1">
                                @for (reply of thread().replies; track reply.id) {
                                    <div class="bg-base-100 rounded p-1.5 text-xs">
                                        <div class="flex items-center gap-1 mb-0.5">
                                            <ng-icon
                                                [name]="reply.author === 'agent' ? 'lucideBot' : 'lucideUser'"
                                                class="size-2.5"
                                            />
                                            <span
                                                class="badge badge-xs badge-outline"
                                                [class.badge-primary]="reply.author === 'user'"
                                                [class.badge-accent]="reply.author === 'agent'"
                                            >
                                                {{ reply.author }}
                                            </span>
                                            <span class="opacity-50">{{ reply.created_at | relativeTime }}</span>
                                            @if (reply.status === 'draft') {
                                                <span class="badge badge-xs badge-outline badge-warning">draft</span>
                                            }
                                        </div>
                                        @if (editingReplyId() === reply.id) {
                                            <textarea
                                                class="textarea textarea-sm textarea-bordered w-full mt-0.5"
                                                rows="2"
                                                aria-label="Edit reply"
                                                [value]="editContent()"
                                                (input)="editContent.set($any($event.target).value)"
                                            ></textarea>
                                            <div class="flex justify-end gap-1 mt-0.5">
                                                <button class="btn btn-xs btn-ghost" (click)="cancelEditReply()">Cancel</button>
                                                <button
                                                    class="btn btn-xs btn-primary"
                                                    [disabled]="!editContent().trim()"
                                                    (click)="saveEditReply(reply.id)"
                                                >
                                                    Save
                                                </button>
                                            </div>
                                        } @else {
                                            <p class="whitespace-pre-wrap">{{ reply.content }}</p>
                                            @if (reply.status === 'draft') {
                                                <div class="flex justify-end gap-1 mt-0.5">
                                                    <button class="btn btn-xs btn-ghost" (click)="startEditReply(reply)">
                                                        <ng-icon name="lucidePencil" class="size-2.5" />
                                                    </button>
                                                    <button class="btn btn-xs btn-ghost text-error" (click)="deleteReply(reply.id)">
                                                        <ng-icon name="lucideTrash2" class="size-2.5" />
                                                    </button>
                                                </div>
                                            }
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            }
        </div>

        <!-- Sticky bottom: actions + reply form -->
        @if (!editing()) {
            <div class="flex justify-end gap-1 mt-1 shrink-0">
                @switch (c.status) {
                    @case ('draft') {
                        <button class="btn btn-xs btn-ghost" title="Edit comment" (click)="startEdit()">
                            <ng-icon name="lucidePencil" class="size-3" />
                            Edit
                        </button>
                        <button
                            class="btn btn-xs btn-ghost text-error"
                            title="Delete comment"
                            (click)="commentDeleted.emit(thread())"
                        >
                            <ng-icon name="lucideTrash2" class="size-3" />
                            Delete
                        </button>
                    }
                    @case ('sent') {
                        <button
                            class="btn btn-xs btn-ghost"
                            title="Mark as resolved"
                            (click)="commentResolved.emit(thread())"
                        >
                            <ng-icon name="lucideCheck" class="size-3" />
                            Resolve
                        </button>
                        <button
                            class="btn btn-xs btn-ghost"
                            title="Reply"
                            (click)="showReplyForm.set(true)"
                        >
                            <ng-icon name="lucideReply" class="size-3" />
                            Reply
                        </button>
                    }
                    @case ('resolved') {
                        <button
                            class="btn btn-xs btn-ghost"
                            title="Reply"
                            (click)="showReplyForm.set(true)"
                        >
                            <ng-icon name="lucideReply" class="size-3" />
                            Reply
                        </button>
                    }
                }
            </div>

            @if (showReplyForm()) {
                <div class="mt-1 shrink-0">
                    <textarea
                        class="textarea textarea-bordered textarea-sm w-full"
                        rows="2"
                        placeholder="Write a reply..."
                        aria-label="Reply to comment"
                        [(ngModel)]="replyContent"
                    ></textarea>
                    <div class="flex justify-end gap-1 mt-1">
                        <button class="btn btn-xs btn-ghost" (click)="cancelReply()">
                            <ng-icon name="lucideX" class="size-3" />
                            Cancel
                        </button>
                        <button
                            class="btn btn-xs btn-primary"
                            [disabled]="!replyContent().trim()"
                            (click)="submitReply()"
                        >
                            <ng-icon name="lucideReply" class="size-3" />
                            Reply
                        </button>
                    </div>
                </div>
            }
        }
    `,
})
export class InlineComment {
    readonly thread = input.required<CommentThread>();
    readonly sessionId = input.required<string>();

    readonly commentDeleted = output<CommentThread>();
    readonly commentResolved = output<CommentThread>();
    readonly replyCreated = output<{ thread: CommentThread; content: string }>();

    readonly #commentStore = inject(CommentStore);

    protected readonly expanded = signal(false);
    protected readonly repliesExpanded = signal(false);
    protected readonly editing = signal(false);
    protected readonly editingReplyId = signal<string | null>(null);
    protected readonly editContent = signal('');
    protected readonly showReplyForm = signal(false);
    protected readonly replyContent = signal('');

    protected readonly isLongContent = computed(() => {
        const content = this.thread().comment.content;
        return content.split('\n').length > 4 || content.length > 300;
    });

    protected toggleExpanded(): void {
        this.expanded.update((v) => !v);
    }

    protected toggleReplies(): void {
        this.repliesExpanded.update((v) => !v);
    }

    protected startEdit(): void {
        this.editContent.set(this.thread().comment.content);
        this.editing.set(true);
    }

    protected cancelEdit(): void {
        this.editing.set(false);
        this.editContent.set('');
    }

    protected saveEdit(): void {
        const content = this.editContent().trim();
        if (!content) return;
        this.#commentStore.updateComment(this.thread().comment.id, { content });
        this.editing.set(false);
        this.editContent.set('');
    }

    protected startEditReply(reply: Comment): void {
        this.editContent.set(reply.content);
        this.editingReplyId.set(reply.id);
    }

    protected cancelEditReply(): void {
        this.editingReplyId.set(null);
        this.editContent.set('');
    }

    protected saveEditReply(replyId: string): void {
        const content = this.editContent().trim();
        if (!content) return;
        this.#commentStore.updateComment(replyId, { content });
        this.editingReplyId.set(null);
        this.editContent.set('');
    }

    protected deleteReply(replyId: string): void {
        this.#commentStore.deleteComment(replyId);
    }

    protected cancelReply(): void {
        this.showReplyForm.set(false);
        this.replyContent.set('');
    }

    protected submitReply(): void {
        const content = this.replyContent().trim();
        if (!content) return;
        this.#commentStore.createReply(this.thread().comment.id, { content });
        this.showReplyForm.set(false);
        this.replyContent.set('');
    }
}
