import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
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

                <div class="flex items-center gap-2">
                    @if (isEditing()) {
                        <input
                            class="input input-sm input-bordered w-32"
                            [value]="editValue()"
                            (input)="editValue.set($any($event.target).value)"
                            (keydown.escape)="cancelEdit()"
                        />
                        <button
                            class="btn btn-success btn-xs"
                            [disabled]="!editValue() || editValue() === r.base_branch"
                            (click)="saveEdit()"
                        >
                            Save
                        </button>
                        <button class="btn btn-ghost btn-xs" (click)="cancelEdit()">Cancel</button>
                    } @else {
                        <span class="badge badge-neutral">{{ r.base_branch }}</span>
                        <button class="btn btn-ghost btn-xs" (click)="startEdit()">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                        </button>
                    }
                </div>

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
    readonly baseBranchEdited = output<{ id: string; baseBranch: string }>();

    protected readonly isEditing = signal(false);
    protected readonly editValue = signal('');

    protected startEdit(): void {
        this.editValue.set(this.repo().base_branch);
        this.isEditing.set(true);
    }

    protected saveEdit(): void {
        this.baseBranchEdited.emit({ id: this.repo().id, baseBranch: this.editValue() });
        this.isEditing.set(false);
    }

    protected cancelEdit(): void {
        this.isEditing.set(false);
    }
}
