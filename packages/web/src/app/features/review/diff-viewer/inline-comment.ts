import type { CommentThread } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RelativeTime } from '../../../shared/pipes/relative-time';

@Component({
    selector: 'acr-inline-comment',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTime, NgIcon],
    host: { class: 'block' },
    template: `
        @let c = thread().comment;
        <div class="bg-base-200 border border-base-300 rounded-lg p-2 my-1 text-sm">
            <div class="flex items-center gap-2 text-xs mb-1">
                <ng-icon
                    [name]="c.author === 'agent' ? 'lucideBot' : 'lucideUser'"
                    class="size-3"
                />
                <span
                    class="badge badge-xs"
                    [class.badge-primary]="c.author === 'user'"
                    [class.badge-accent]="c.author === 'agent'"
                >
                    {{ c.author }}
                </span>
                <span class="opacity-50">{{ c.created_at | relativeTime }}</span>
                <span
                    class="badge badge-xs"
                    [class.badge-warning]="c.status === 'draft'"
                    [class.badge-info]="c.status === 'sent'"
                    [class.badge-success]="c.status === 'resolved'"
                >
                    {{ c.status }}
                </span>
            </div>

            <p
                class="whitespace-pre-wrap"
                [class.line-clamp-4]="!expanded()"
            >
                {{ c.content }}
            </p>

            @if (isLongContent()) {
                <button class="btn btn-xs btn-ghost mt-1" (click)="expanded.update(v => !v)">
                    {{ expanded() ? 'Show less' : 'Show more' }}
                </button>
            }

            @if (thread().replies.length > 0) {
                <div class="mt-1">
                    <button class="btn btn-xs btn-ghost" (click)="repliesExpanded.update(v => !v)">
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
                                            class="badge badge-xs"
                                            [class.badge-primary]="reply.author === 'user'"
                                            [class.badge-accent]="reply.author === 'agent'"
                                        >
                                            {{ reply.author }}
                                        </span>
                                        <span class="opacity-50">{{ reply.created_at | relativeTime }}</span>
                                    </div>
                                    <p class="whitespace-pre-wrap">{{ reply.content }}</p>
                                </div>
                            }
                        </div>
                    }
                </div>
            }

            <div class="flex justify-end gap-1 mt-1">
                @switch (c.status) {
                    @case ('draft') {
                        <button class="btn btn-xs btn-ghost" (click)="commentEdited.emit(thread())">
                            <ng-icon name="lucidePencil" class="size-3" />
                            Edit
                        </button>
                        <button class="btn btn-xs btn-ghost text-error" (click)="commentDeleted.emit(thread())">
                            <ng-icon name="lucideTrash2" class="size-3" />
                            Delete
                        </button>
                    }
                    @case ('sent') {
                        <button class="btn btn-xs btn-ghost" (click)="commentResolved.emit(thread())">
                            <ng-icon name="lucideCheck" class="size-3" />
                            Resolve
                        </button>
                        <button class="btn btn-xs btn-ghost" (click)="replyCreated.emit({ thread: thread(), content: '' })">
                            <ng-icon name="lucideReply" class="size-3" />
                            Reply
                        </button>
                    }
                    @case ('resolved') {
                        <button class="btn btn-xs btn-ghost" (click)="replyCreated.emit({ thread: thread(), content: '' })">
                            <ng-icon name="lucideReply" class="size-3" />
                            Reply
                        </button>
                    }
                }
            </div>
        </div>
    `,
})
export class InlineComment {
    readonly thread = input.required<CommentThread>();
    readonly sessionId = input.required<string>();

    readonly commentEdited = output<CommentThread>();
    readonly commentDeleted = output<CommentThread>();
    readonly commentResolved = output<CommentThread>();
    readonly replyCreated = output<{ thread: CommentThread; content: string }>();

    protected readonly expanded = signal(false);
    protected readonly repliesExpanded = signal(false);

    protected readonly isLongContent = computed(() => {
        const content = this.thread().comment.content;
        return content.split('\n').length > 4 || content.length > 300;
    });
}
