import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'acr-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<h1 class="text-2xl p-4">Settings</h1>`,
})
export class Settings {}
