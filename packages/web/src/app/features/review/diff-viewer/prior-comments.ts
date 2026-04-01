import type { CommentThread, SnapshotSummary } from '@agent-code-reviewer/shared';
import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RelativeTime } from '../../../shared/pipes/relative-time';

export interface PriorSnapshotComments {
    snapshot: SnapshotSummary;
    threads: CommentThread[];
}

@Component({
    selector: 'acr-prior-comments',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIcon, RelativeTime, SlicePipe],
    host: { class: 'block border-b border-base-300' },
    template: `
        <button
            class="flex items-center gap-2 w-full px-4 py-2 text-xs hover:bg-base-200 transition-colors"
            [attr.aria-expanded]="expanded()"
            (click)="expanded.update(v => !v)"
        >
            <ng-icon
                [name]="expanded() ? 'lucideChevronDown' : 'lucideChevronRight'"
                class="size-3"
            />
            <ng-icon name="lucideMessageCircle" class="size-3 text-info" />
            <span class="font-semibold">Comments from other snapshots</span>
            <span class="badge badge-xs badge-info">{{ totalCount() }}</span>
        </button>

        @if (expanded()) {
            <div class="px-4 pb-3 space-y-3 max-h-80 overflow-y-auto">
                @for (group of groups(); track group.snapshot.id) {
                    <div>
                        <button
                            class="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 mb-1"
                            title="Jump to this snapshot"
                            (click)="snapshotClicked.emit(group.snapshot.id)"
                        >
                            <ng-icon name="lucideHistory" class="size-3" />
                            <span class="font-mono">{{ group.snapshot.id | slice: 0 : 8 }}</span>
                            <span>{{ group.snapshot.created_at | relativeTime }}</span>
                            <span class="badge badge-xs">{{ group.threads.length }}</span>
                        </button>

                        <div class="ml-4 space-y-1.5">
                            @for (thread of group.threads; track thread.comment.id) {
                                <div class="bg-base-200 rounded-lg p-2 text-xs font-mono">
                                    <div class="flex items-center gap-1.5 mb-1">
                                        <ng-icon
                                            [name]="thread.comment.author === 'agent' ? 'lucideBot' : 'lucideUser'"
                                            class="size-3"
                                        />
                                        <span
                                            class="badge badge-xs badge-outline"
                                            [class.badge-primary]="thread.comment.author === 'user'"
                                            [class.badge-accent]="thread.comment.author === 'agent'"
                                        >
                                            {{ thread.comment.author }}
                                        </span>
                                        @if (thread.comment.line_start != null) {
                                            <span class="badge badge-xs badge-ghost">
                                                L{{ thread.comment.line_start }}@if (
                                                    thread.comment.line_end != null &&
                                                    thread.comment.line_end !== thread.comment.line_start
                                                ) {-{{ thread.comment.line_end }}}
                                            </span>
                                        } @else {
                                            <span class="badge badge-xs badge-ghost">file</span>
                                        }
                                        <span
                                            class="badge badge-xs badge-outline"
                                            [class.badge-info]="thread.comment.status === 'sent'"
                                            [class.badge-success]="thread.comment.status === 'resolved'"
                                            [class.badge-warning]="thread.comment.status === 'draft'"
                                        >
                                            {{ thread.comment.status }}
                                        </span>
                                    </div>

                                    <p class="whitespace-pre-wrap line-clamp-3">{{ thread.comment.content }}</p>

                                    @if (thread.replies.length > 0) {
                                        <div class="ml-3 mt-1.5 space-y-1 border-l-2 border-base-300 pl-2">
                                            @for (reply of thread.replies; track reply.id) {
                                                <div class="text-xs">
                                                    <div class="flex items-center gap-1 mb-0.5">
                                                        <ng-icon
                                                            [name]="
                                                                reply.author === 'agent' ? 'lucideBot' : 'lucideUser'
                                                            "
                                                            class="size-2.5"
                                                        />
                                                        <span
                                                            class="badge badge-xs badge-outline"
                                                            [class.badge-primary]="reply.author === 'user'"
                                                            [class.badge-accent]="reply.author === 'agent'"
                                                        >
                                                            {{ reply.author }}
                                                        </span>
                                                        <span class="opacity-50">{{
                                                            reply.created_at | relativeTime
                                                        }}</span>
                                                    </div>
                                                    <p class="whitespace-pre-wrap line-clamp-2">{{ reply.content }}</p>
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    </div>
                }
            </div>
        }
    `,
})
export class PriorComments {
    readonly groups = input.required<PriorSnapshotComments[]>();
    readonly totalCount = input.required<number>();
    readonly snapshotClicked = output<string>();

    protected readonly expanded = signal(false);
}
