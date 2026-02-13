import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'acr-notification-dot',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (visible()) {
            <span class="badge badge-xs badge-primary animate-pulse">
                @if (count() !== null && count()! > 0) {
                    {{ count() }}
                }
            </span>
        }
    `,
})
export class NotificationDot {
    readonly visible = input(false);
    readonly count = input<number | null>(null);
}
