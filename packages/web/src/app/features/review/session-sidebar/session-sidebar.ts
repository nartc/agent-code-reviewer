import type { ListSessionsResponse, Session } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ApiClient } from '../../../core/services/api-client';
import { NotificationDot } from '../../../shared/components/notification-dot';
import { RelativeTime } from '../../../shared/pipes/relative-time';

@Component({
    selector: 'acr-session-sidebar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NotificationDot, RelativeTime],
    host: { class: 'flex flex-col h-full' },
    template: `
        <div class="p-2">
            <input
                type="text"
                placeholder="Filter by branch..."
                class="input input-sm input-bordered w-full"
                [value]="filterText()"
                (input)="filterText.set($any($event.target).value)"
            />
        </div>

        @if (sessionsResource.isLoading()) {
            <div class="flex justify-center py-4">
                <span class="loading loading-spinner loading-sm"></span>
            </div>
        } @else if (sessionsResource.error()) {
            <p class="p-2 text-xs text-error">Failed to load sessions</p>
        } @else if (filteredSessions().length === 0) {
            <p class="p-2 text-xs opacity-50">
                {{ filterText() ? 'No matching sessions' : 'No sessions' }}
            </p>
        } @else {
            <ul class="menu menu-sm flex-1 overflow-auto">
                @for (session of filteredSessions(); track session.id) {
                    <li>
                        <button
                            class="flex items-center gap-2"
                            [class.active]="session.id === currentSessionId()"
                            (click)="sessionSelected.emit(session.id)"
                        >
                            <span class="truncate flex-1 text-left">{{ session.branch }}</span>
                            <acr-notification-dot [visible]="session.is_watching" />
                            <span class="text-xs opacity-50 whitespace-nowrap">{{ session.created_at | relativeTime }}</span>
                        </button>
                    </li>
                }
            </ul>
        }
    `,
})
export class SessionSidebar {
    readonly repoId = input.required<string>();
    readonly currentSessionId = input.required<string>();
    readonly sessionSelected = output<string>();

    readonly #api = inject(ApiClient);

    protected readonly filterText = signal('');

    protected readonly sessionsResource = rxResource<Session[], string>({
        params: () => this.repoId(),
        stream: ({ params: repoId }) => this.#api.listSessions(repoId).pipe(
            map((r: ListSessionsResponse) => r.sessions),
        ),
        defaultValue: [],
    });

    protected readonly filteredSessions = computed(() => {
        const text = this.filterText().toLowerCase();
        const sessions = this.sessionsResource.value();
        if (!text) return sessions;
        return sessions.filter((s) => s.branch.toLowerCase().includes(text));
    });
}
