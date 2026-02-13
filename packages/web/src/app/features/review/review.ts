import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'acr-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<h1 class="text-2xl p-4">Review: {{ sessionId() }}</h1>`,
})
export class Review {
    readonly sessionId = input.required<string>();
}
