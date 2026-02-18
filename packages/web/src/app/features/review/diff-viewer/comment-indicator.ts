import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
    selector: 'acr-comment-indicator',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIcon],
    template: `
        <button
            class="badge badge-sm badge-primary cursor-pointer inline-flex items-center gap-0.5"
            (click)="clicked.emit(commentIds())"
        >
            <ng-icon name="lucideMessageSquare" class="size-3" />
            {{ count() }}
        </button>
    `,
})
export class CommentIndicator {
    readonly count = input.required<number>();
    readonly commentIds = input.required<string[]>();

    readonly clicked = output<string[]>();
}
