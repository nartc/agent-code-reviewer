import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'acr-home',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="text-2xl p-4">Home</h1>
    `,
})
export class Home {}
