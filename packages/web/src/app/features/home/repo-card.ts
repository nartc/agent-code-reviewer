import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RepoWithPaths } from '@agent-code-reviewer/shared';
import { RelativeTime } from '../../shared/pipes/relative-time';

@Component({
    selector: 'acr-repo-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RelativeTime],
    template: `
        @let r = repo();
        <div class="card bg-base-200 shadow-sm">
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
                    <button class="btn btn-primary btn-sm" (click)="opened.emit(r)">Open</button>
                    <button class="btn btn-error btn-sm btn-outline" (click)="deleted.emit(r.id)">Delete</button>
                </div>
            </div>
        </div>
    `,
})
export class RepoCard {
    readonly repo = input.required<RepoWithPaths>();
    readonly opened = output<RepoWithPaths>();
    readonly deleted = output<string>();
}
