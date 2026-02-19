import type { CommentThread } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RelativeTime } from '../../../shared/pipes/relative-time';

@Component({
    selector: 'acr-comment-list-item',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTime, NgIcon],
    host: {
        class: 'block cursor-pointer',
        '(click)': 'onClick($event)',
    },
    template: `
        @let c = thread().comment;

        <div
            class="card card-compact bg-base-100 shadow-sm hover:bg-base-200 transition-colors"
            [class.opacity-50]="c.status === 'resolved'"
        >
            <div class="card-body gap-1">
                @if (showFileHeader()) {
                    <div class="flex items-center gap-1 flex-wrap text-xs">
                        @if (c.file_path === '[general]') {
                            <span class="badge badge-xs badge-neutral">General</span>
                        } @else {
                            <span class="badge badge-xs badge-neutral font-mono truncate max-w-48">{{ c.file_path }}</span>
                            @if (c.line_start != null) {
                                <span class="badge badge-xs badge-ghost">L{{ c.line_start }}</span>
                            }
                        }
                    </div>
                }

                <div class="flex items-center gap-2 text-xs">
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
                    @if (showStatus()) {
                        <span
                            class="badge badge-xs"
                            [class.badge-warning]="c.status === 'draft'"
                            [class.badge-info]="c.status === 'sent'"
                            [class.badge-success]="c.status === 'resolved'"
                        >
                            {{ c.status }}
                        </span>
                    }
                </div>

                <p
                    class="text-sm whitespace-pre-wrap"
                    [class.line-clamp-2]="!expanded()"
                    (click)="toggleExpand($event)"
                >
                    {{ c.content }}
                </p>

                @if (showActions()) {
                    <div class="flex justify-end gap-1" (click)="$event.stopPropagation()">
                        @switch (c.status) {
                            @case ('draft') {
                                <button class="btn btn-xs btn-ghost" title="Edit comment" (click)="commentEdited.emit(thread())">
                                    <ng-icon name="lucidePencil" class="size-3" />
                                    Edit
                                </button>
                                <button class="btn btn-xs btn-ghost text-error" title="Delete comment" (click)="commentDeleted.emit(thread())">
                                    <ng-icon name="lucideTrash2" class="size-3" />
                                    Delete
                                </button>
                            }
                            @case ('sent') {
                                <button class="btn btn-xs btn-ghost" title="Mark as resolved" (click)="commentResolved.emit(thread())">
                                    <ng-icon name="lucideCheck" class="size-3" />
                                    Resolve
                                </button>
                                <button class="btn btn-xs btn-ghost" title="Reply" (click)="replyCreated.emit({ thread: thread(), content: '' })">
                                    <ng-icon name="lucideReply" class="size-3" />
                                    Reply
                                </button>
                            }
                            @case ('resolved') {
                                <button class="btn btn-xs btn-ghost" title="Reply" (click)="replyCreated.emit({ thread: thread(), content: '' })">
                                    <ng-icon name="lucideReply" class="size-3" />
                                    Reply
                                </button>
                            }
                        }
                    </div>
                }
            </div>
        </div>
    `,
})
export class CommentListItem {
    readonly thread = input.required<CommentThread>();
    readonly showActions = input(false);
    readonly showFileHeader = input(true);
    readonly showStatus = input(true);

    readonly commentClicked = output<{ filePath: string; lineStart: number | null; side: string }>();
    readonly commentEdited = output<CommentThread>();
    readonly commentDeleted = output<CommentThread>();
    readonly commentResolved = output<CommentThread>();
    readonly replyCreated = output<{ thread: CommentThread; content: string }>();

    protected readonly expanded = signal(false);

    protected toggleExpand(event: Event): void {
        event.stopPropagation();
        this.expanded.update((v) => !v);
    }

    protected onClick(event: Event): void {
        const target = event.target as HTMLElement;
        if (target.closest('button')) return;
        const c = this.thread().comment;
        if (c.file_path === '[general]') return;
        this.commentClicked.emit({
            filePath: c.file_path,
            lineStart: c.line_start,
            side: c.side ?? 'new',
        });
    }
}
