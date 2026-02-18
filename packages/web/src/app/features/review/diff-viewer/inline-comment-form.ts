import type { Comment } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommentStore } from '../../../core/stores/comment-store';

@Component({
    selector: 'acr-inline-comment-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    host: {
        '(keydown.meta.enter)': 'onSave()',
        '(keydown.control.enter)': 'onSave()',
        '(keydown.escape)': 'onCancel()',
    },
    template: `
        <div class="card card-compact bg-base-200">
            <div class="card-body gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="badge badge-sm badge-neutral font-mono">{{ filePath() }}</span>
                    @if (isFileLevel()) {
                        <span class="badge badge-sm badge-ghost">File comment</span>
                    } @else if (lineEnd(); as end) {
                        <span class="badge badge-sm badge-ghost">Lines {{ lineStart() }}-{{ end }}</span>
                    } @else {
                        <span class="badge badge-sm badge-ghost">Line {{ lineStart() }}</span>
                    }
                    <span class="badge badge-sm badge-outline">{{ side() }}</span>
                </div>

                <textarea
                    class="textarea textarea-bordered w-full"
                    rows="3"
                    placeholder="Write a comment..."
                    [(ngModel)]="content"
                    #textareaEl
                ></textarea>

                <div class="flex justify-end gap-2">
                    <button class="btn btn-sm btn-ghost" (click)="onCancel()">Cancel</button>
                    <button
                        class="btn btn-sm btn-primary"
                        [disabled]="!content().trim() || isSaving()"
                        (click)="onSave()"
                    >
                        @if (isSaving()) {
                            <span class="loading loading-spinner loading-xs"></span>
                        }
                        Save Draft
                    </button>
                </div>
            </div>
        </div>
    `,
})
export class InlineCommentForm {
    readonly filePath = input.required<string>();
    readonly lineStart = input.required<number>();
    readonly lineEnd = input<number | undefined>();
    readonly side = input.required<'old' | 'new' | 'both'>();
    readonly snapshotId = input.required<string>();
    readonly sessionId = input.required<string>();
    readonly isFileLevel = input(false);

    readonly saved = output<Comment>();
    readonly cancelled = output<void>();

    protected readonly content = signal('');
    protected readonly isSaving = signal(false);

    readonly #commentStore = inject(CommentStore);

    protected onSave(): void {
        const text = this.content().trim();
        if (!text || this.isSaving()) return;

        this.isSaving.set(true);
        this.#commentStore.createComment(
            {
                session_id: this.sessionId(),
                snapshot_id: this.snapshotId(),
                file_path: this.filePath(),
                content: text,
                line_start: this.isFileLevel() ? undefined : this.lineStart(),
                line_end: this.isFileLevel() ? undefined : this.lineEnd(),
                side: this.side(),
                author: 'user',
            },
            (comment) => {
                this.isSaving.set(false);
                this.saved.emit(comment);
            },
        );
    }

    protected onCancel(): void {
        this.cancelled.emit();
    }
}
