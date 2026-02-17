import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { SessionStore } from '../../core/stores/session-store';

@Component({
    selector: 'acr-review',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col flex-1' },
    template: `
        @let session = store.currentSession();
        @if (session) {
            <header class="flex items-center gap-3 p-4 border-b border-base-300">
                <h1 class="text-xl font-bold">{{ session.repo.name }}</h1>
                <span class="badge badge-neutral">{{ session.branch }}</span>
                <span class="text-xs opacity-50 font-mono truncate">{{ session.repo_path.path }}</span>
            </header>
            <p class="p-4 opacity-50">Diff viewer coming in Phase 10.</p>
        } @else if (store.sessionError()) {
            <p class="p-4 text-error">Session not found.</p>
        } @else {
            <div class="flex justify-center py-12">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        }
    `,
})
export class Review {
    protected readonly store = inject(SessionStore);
    readonly sessionId = input.required<string>();

    constructor() {
        effect(() => {
            this.store.loadSession(this.sessionId());
        });
    }
}
