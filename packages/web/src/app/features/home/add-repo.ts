import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ScannedRepo } from '@agent-code-reviewer/shared';
import { ApiClient } from '../../core/services/api-client';

@Component({
    selector: 'acr-add-repo',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="space-y-6">
            <div>
                <h3 class="text-lg font-semibold mb-2">Register Repository</h3>
                <div class="flex gap-2">
                    <input
                        class="input input-bordered flex-1"
                        placeholder="Enter repository path..."
                        [value]="manualPath()"
                        (input)="onManualInput($any($event.target).value)"
                    />
                    <button
                        class="btn btn-primary"
                        [disabled]="!manualPath()"
                        (click)="registerRepo()"
                    >
                        Register
                    </button>
                </div>
                @if (manualError()) {
                    <p class="text-error text-sm mt-1">{{ manualError() }}</p>
                }
            </div>

            <div>
                <div class="flex items-center gap-3 mb-2">
                    <h3 class="text-lg font-semibold">Scan Filesystem</h3>
                    <button
                        class="btn btn-secondary btn-sm"
                        [disabled]="isScanning()"
                        (click)="scan()"
                    >
                        @if (isScanning()) {
                            <span class="loading loading-spinner loading-xs"></span>
                            Scanning...
                        } @else {
                            Scan
                        }
                    </button>
                </div>

                @if (scanError()) {
                    <p class="text-error text-sm mb-2">{{ scanError() }}</p>
                }

                @if (scanResults().length > 0) {
                    <div class="overflow-x-auto">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Path</th>
                                    <th>Branch</th>
                                    <th>Remote</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (result of scanResults(); track result.path) {
                                    @let dimmed = isRegistered(result.path);
                                    <tr [class.opacity-50]="dimmed">
                                        <td>{{ result.name }}</td>
                                        <td class="font-mono text-xs truncate max-w-48">{{ result.path }}</td>
                                        <td>{{ result.current_branch }}</td>
                                        <td class="font-mono text-xs truncate max-w-32">{{ result.remote_url ?? '-' }}</td>
                                        <td>
                                            @if (dimmed) {
                                                <span class="badge badge-ghost badge-sm">Registered</span>
                                            } @else {
                                                <button class="btn btn-success btn-xs" (click)="addScanned(result.path)">Add</button>
                                            }
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                } @else if (!isScanning() && hasScanned()) {
                    <p class="text-sm opacity-60">No repositories found.</p>
                }
            </div>
        </div>
    `,
})
export class AddRepo {
    readonly registeredRepoPaths = input<string[]>([]);
    readonly repoAdded = output<void>();

    readonly #api = inject(ApiClient);
    readonly #destroyRef = inject(DestroyRef);

    protected readonly manualPath = signal('');
    protected readonly manualError = signal<string | null>(null);
    protected readonly scanResults = signal<ScannedRepo[]>([]);
    protected readonly isScanning = signal(false);
    protected readonly scanError = signal<string | null>(null);
    protected readonly addedPaths = signal<Set<string>>(new Set());
    protected readonly hasScanned = signal(false);

    protected onManualInput(value: string): void {
        this.manualPath.set(value);
        this.manualError.set(null);
    }

    protected registerRepo(): void {
        const path = this.manualPath();
        if (!path) return;

        this.#api.createRepo({ path }).subscribe({
            next: () => {
                this.manualPath.set('');
                this.manualError.set(null);
                this.repoAdded.emit();
            },
            error: (err) => {
                const message = err?.error?.message ?? err?.message ?? 'Failed to register repository';
                this.manualError.set(message);
            },
        });
    }

    protected scan(): void {
        this.isScanning.set(true);
        this.scanResults.set([]);
        this.scanError.set(null);
        this.hasScanned.set(true);

        this.#api
            .scanRepos()
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe({
                next: (repo) => {
                    this.scanResults.update((prev) => [...prev, repo]);
                },
                error: (err) => {
                    this.isScanning.set(false);
                    this.scanError.set(err?.message ?? 'Scan failed');
                },
                complete: () => {
                    this.isScanning.set(false);
                },
            });
    }

    protected addScanned(path: string): void {
        this.addedPaths.update((s) => new Set(s).add(path));

        this.#api.createRepo({ path }).subscribe({
            next: () => {
                this.repoAdded.emit();
            },
            error: (err) => {
                this.addedPaths.update((s) => {
                    const next = new Set(s);
                    next.delete(path);
                    return next;
                });
                console.error('Failed to add scanned repo:', err);
            },
        });
    }

    protected isRegistered(path: string): boolean {
        return this.registeredRepoPaths().includes(path) || this.addedPaths().has(path);
    }
}
