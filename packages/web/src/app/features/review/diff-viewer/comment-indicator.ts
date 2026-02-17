import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
    selector: 'acr-comment-indicator',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button
            class="badge badge-sm badge-primary cursor-pointer"
            (click)="clicked.emit(commentIds())"
        >
            💬 {{ count() }}
        </button>
    `,
})
export class CommentIndicator {
    readonly count = input.required<number>();
    readonly commentIds = input.required<string[]>();

    readonly clicked = output<string[]>();
}
