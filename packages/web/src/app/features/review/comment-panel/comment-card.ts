import type { Comment } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RelativeTime } from '../../../shared/pipes/relative-time';

@Component({
    selector: 'acr-comment-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTime, FormsModule],
    host: { '[class.ml-6]': 'isReply()' },
    template: `
        <div class="card card-compact bg-base-100 shadow-sm">
            <div class="card-body gap-1">
                @if (!isReply()) {
                    <div class="flex items-center gap-1 flex-wrap text-xs">
                        @if (comment().file_path) {
                            <span class="badge badge-xs badge-neutral font-mono">{{ comment().file_path }}</span>
                        }
                        @if (comment().line_start != null) {
                            <span class="badge badge-xs badge-ghost">
                                L{{ comment().line_start }}@if (comment().line_end != null) {-{{ comment().line_end }}}
                            </span>
                        }
                        @if (comment().side) {
                            <span class="badge badge-xs badge-outline">{{ comment().side }}</span>
                        }
                    </div>
                }

                <div class="flex items-center gap-2 text-xs">
                    <span
                        class="badge badge-xs"
                        [class.badge-primary]="comment().author === 'user'"
                        [class.badge-secondary]="comment().author === 'agent'"
                    >
                        {{ comment().author }}
                    </span>
                    <span class="opacity-50">{{ comment().created_at | relativeTime }}</span>
                    <span
                        class="badge badge-xs"
                        [class.badge-warning]="comment().status === 'draft'"
                        [class.badge-info]="comment().status === 'sent'"
                        [class.badge-success]="comment().status === 'resolved'"
                    >
                        {{ comment().status }}
                    </span>
                </div>

                @if (isEditing()) {
                    <textarea
                        class="textarea textarea-bordered textarea-sm w-full"
                        rows="3"
                        [(ngModel)]="editContent"
                    ></textarea>
                    <div class="flex justify-end gap-1">
                        <button class="btn btn-xs btn-ghost" (click)="cancelEdit()">Cancel</button>
                        <button
                            class="btn btn-xs btn-primary"
                            [disabled]="!editContent().trim()"
                            (click)="saveEdit()"
                        >
                            Save
                        </button>
                    </div>
                } @else {
                    <p class="text-sm whitespace-pre-wrap">{{ comment().content }}</p>

                    <div class="flex justify-end gap-1">
                        @switch (comment().status) {
                            @case ('draft') {
                                <button class="btn btn-xs btn-ghost" (click)="startEdit()">Edit</button>
                                <button class="btn btn-xs btn-ghost text-error" (click)="deleted.emit(comment().id)">
                                    Delete
                                </button>
                            }
                            @case ('sent') {
                                <button class="btn btn-xs btn-ghost" (click)="resolved.emit(comment().id)">Resolve</button>
                                <button class="btn btn-xs btn-ghost" (click)="replyRequested.emit(comment().id)">
                                    Reply
                                </button>
                            }
                            @case ('resolved') {
                                <button class="btn btn-xs btn-ghost" (click)="replyRequested.emit(comment().id)">
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
export class CommentCard {
    readonly comment = input.required<Comment>();
    readonly isReply = input(false);

    readonly edited = output<{ id: string; content: string }>();
    readonly deleted = output<string>();
    readonly resolved = output<string>();
    readonly replyRequested = output<string>();

    protected readonly isEditing = signal(false);
    protected readonly editContent = signal('');

    protected startEdit(): void {
        this.editContent.set(this.comment().content);
        this.isEditing.set(true);
    }

    protected saveEdit(): void {
        const content = this.editContent().trim();
        if (!content) return;
        this.edited.emit({ id: this.comment().id, content });
        this.isEditing.set(false);
    }

    protected cancelEdit(): void {
        this.isEditing.set(false);
    }
}
