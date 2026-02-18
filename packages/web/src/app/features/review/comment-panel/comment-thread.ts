import type { CommentThread } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { CommentCard } from './comment-card';

@Component({
    selector: 'acr-comment-thread',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommentCard, FormsModule, NgIcon],
    template: `
        <acr-comment-card
            [comment]="thread().comment"
            [showFileHeader]="showFileHeader()"
            [showStatus]="showStatus()"
            (edited)="commentEdited.emit($event)"
            (deleted)="commentDeleted.emit($event)"
            (resolved)="commentResolved.emit($event)"
            (replyRequested)="onReplyRequested()"
        />

        @if (thread().replies.length > 0) {
            @if (hasLongThread()) {
                <div class="collapse collapse-arrow bg-base-100 ml-6 mt-1">
                    <input type="checkbox" aria-label="Toggle replies" />
                    <div class="collapse-title text-xs font-medium py-1 min-h-0">
                        Show {{ thread().replies.length }} replies
                    </div>
                    <div class="collapse-content px-0">
                        @for (reply of thread().replies; track reply.id) {
                            <acr-comment-card
                                class="mt-1"
                                [comment]="reply"
                                [isReply]="true"
                                [showStatus]="showStatus()"
                                (edited)="commentEdited.emit($event)"
                                (deleted)="commentDeleted.emit($event)"
                                (resolved)="commentResolved.emit($event)"
                                (replyRequested)="onReplyRequested()"
                            />
                        }
                    </div>
                </div>
            } @else {
                @for (reply of thread().replies; track reply.id) {
                    <acr-comment-card
                        class="mt-1"
                        [comment]="reply"
                        [isReply]="true"
                        [showStatus]="showStatus()"
                        (edited)="commentEdited.emit($event)"
                        (deleted)="commentDeleted.emit($event)"
                        (resolved)="commentResolved.emit($event)"
                        (replyRequested)="onReplyRequested()"
                    />
                }
            }
        }

        @if (showReplyForm()) {
            <div class="ml-6 mt-1">
                <textarea
                    class="textarea textarea-bordered textarea-sm w-full"
                    rows="2"
                    placeholder="Write a reply..."
                    aria-label="Reply to comment"
                    [(ngModel)]="replyContent"
                ></textarea>
                <div class="flex justify-end gap-1 mt-1">
                    <button class="btn btn-xs btn-ghost" title="Cancel" (click)="showReplyForm.set(false)">
                        <ng-icon name="lucideX" class="size-3" />
                        Cancel
                    </button>
                    <button
                        class="btn btn-xs btn-primary"
                        title="Submit reply"
                        [disabled]="!replyContent().trim()"
                        (click)="submitReply()"
                    >
                        <ng-icon name="lucideReply" class="size-3" />
                        Reply
                    </button>
                </div>
            </div>
        }
    `,
})
export class AcrCommentThread {
    readonly thread = input.required<CommentThread>();
    readonly sessionId = input.required<string>();
    readonly showFileHeader = input(true);
    readonly showStatus = input(true);

    readonly commentEdited = output<{ id: string; content: string }>();
    readonly commentDeleted = output<string>();
    readonly commentResolved = output<string>();
    readonly replyCreated = output<{ parentId: string; content: string }>();

    protected readonly showReplyForm = signal(false);
    protected readonly replyContent = signal('');
    protected readonly hasLongThread = computed(() => this.thread().replies.length > 3);

    protected onReplyRequested(): void {
        this.showReplyForm.set(true);
    }

    protected submitReply(): void {
        const content = this.replyContent().trim();
        if (!content) return;
        this.replyCreated.emit({ parentId: this.thread().comment.id, content });
        this.replyContent.set('');
        this.showReplyForm.set(false);
    }
}
