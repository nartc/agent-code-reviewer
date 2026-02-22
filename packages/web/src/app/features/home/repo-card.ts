import type { RepoWithPaths } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { RelativeTime } from '../../shared/pipes/relative-time';

@Component({
    selector: 'acr-repo-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTime, NgIcon],
    host: { class: 'card bg-base-200 border border-base-300' },
    template: `
        @let r = repo();
        <div class="card-body gap-3">
            <h2 class="card-title">{{ r.name }}</h2>

            <span class="badge badge-neutral">{{ r.base_branch }}</span>

            <p class="font-mono text-xs truncate opacity-70">
                {{ r.remote_url ?? 'Local only' }}
            </p>

            @for (p of r.paths; track p.id) {
                <div class="text-xs opacity-60 truncate">
                    {{ p.path }}
                    @if (p.last_accessed_at) {
                        <span class="ml-1">{{ p.last_accessed_at | relativeTime }}</span>
                    }
                </div>
            }

            <p class="text-xs opacity-50">Created {{ r.created_at | relativeTime }}</p>

            <div class="card-actions justify-end">
                <button class="btn btn-primary btn-sm" (click)="opened.emit(r)">
                    <ng-icon name="lucideExternalLink" class="size-3.5" />
                    Open
                </button>
                <button class="btn btn-error btn-sm btn-outline" (click)="deleted.emit(r.id)">
                    <ng-icon name="lucideTrash2" class="size-3.5" />
                    Delete
                </button>
            </div>
        </div>
    `,
})
export class RepoCard {
    readonly repo = input.required<RepoWithPaths>();
    readonly opened = output<RepoWithPaths>();
    readonly deleted = output<string>();
}
