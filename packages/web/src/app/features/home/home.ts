import type { ListReposResponse, RepoPath, RepoWithPaths } from '@agent-code-reviewer/shared';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient } from '../../core/services/api-client';
import { AddRepo } from './add-repo';
import { RepoCard } from './repo-card';

@Component({
    selector: 'acr-home',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RepoCard, AddRepo],
    template: `
        <div class="container mx-auto p-4 space-y-6">
            <header>
                <h1 class="text-2xl font-bold">Your Repositories</h1>
            </header>

            @if (isLoading() && repos().length === 0) {
                <div class="flex justify-center py-12">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
            } @else if (repos().length === 0) {
                <div class="text-center py-12 opacity-60">
                    <p>No repositories yet. Add one below.</p>
                </div>
            } @else {
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    @for (repo of repos(); track repo.id) {
                        <acr-repo-card
                            [repo]="repo"
                            (opened)="onRepoOpened($event)"
                            (deleted)="onRepoDeleted($event)"
                        />
                    }
                </div>
            }

            <section>
                <acr-add-repo [existingRepoPaths]="existingPaths()" (repoAdded)="onRepoAdded()" />
            </section>
        </div>
    `,
})
export class Home {
    readonly #api = inject(ApiClient);
    readonly #router = inject(Router);

    readonly #reposResource = httpResource<ListReposResponse>(() => '/api/repos');
    readonly repos = computed(() => this.#reposResource.value()?.repos ?? []);
    readonly existingPaths = computed(() => this.repos().flatMap((r: RepoWithPaths) => r.paths.map((p: RepoPath) => p.path)));
    readonly isLoading = computed(() => this.#reposResource.isLoading());

    protected onRepoOpened(repo: RepoWithPaths): void {
        const path = repo.paths[0]?.path;
        if (!path) {
            console.error('Repo has no paths:', repo.id);
            return;
        }

        this.#api.createSession({ repo_id: repo.id, path }).subscribe({
            next: (res) => {
                this.#router.navigate(['/review', res.session.id]);
            },
            error: (err) => {
                console.error('Failed to create session:', err);
            },
        });
    }

    protected onRepoDeleted(repoId: string): void {
        if (!window.confirm('Delete this repository?')) return;

        this.#api.deleteRepo(repoId).subscribe({
            next: () => {
                this.#reposResource.reload();
            },
            error: (err) => {
                console.error('Failed to delete repo:', err);
            },
        });
    }

    protected onRepoAdded(): void {
        this.#reposResource.reload();
    }
}
