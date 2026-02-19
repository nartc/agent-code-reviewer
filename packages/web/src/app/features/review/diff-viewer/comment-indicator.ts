import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
    selector: 'acr-comment-indicator',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIcon],
    template: `
        <span class="badge badge-sm badge-primary inline-flex items-center gap-0.5">
            <ng-icon [name]="iconName()" class="size-3" />
            {{ count() }}
        </span>
    `,
})
export class CommentIndicator {
    readonly count = input.required<number>();
    readonly commentIds = input.required<string[]>();
    readonly hasMultiLine = input(false);

    protected readonly iconName = computed(() =>
        this.hasMultiLine() ? 'lucideMessageSquareText' : 'lucideMessageSquare',
    );
}
