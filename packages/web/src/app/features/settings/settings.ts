import type { TransportType } from '@agent-code-reviewer/shared';
import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeSwitcher, type Theme } from '../../core/services/theme-switcher';
import { TransportStore } from '../../core/stores/transport-store';

const THEMES: Theme[] = ['light', 'dark', 'system'];
const TRANSPORT_TYPES: TransportType[] = ['tmux', 'mcp', 'clipboard'];

@Component({
    selector: 'acr-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TitleCasePipe],
    template: `
        <div class="max-w-2xl mx-auto p-6 flex flex-col gap-6">
            <h1 class="text-2xl font-bold">Settings</h1>

            <div class="card bg-base-200">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">Theme</h2>
                    <div class="flex gap-2">
                        @for (t of themes; track t) {
                            <button
                                class="btn btn-sm"
                                [class.btn-primary]="themeSwitcher.theme() === t"
                                [class.btn-ghost]="themeSwitcher.theme() !== t"
                                (click)="themeSwitcher.setTheme(t)"
                            >
                                {{ t | titlecase }}
                            </button>
                        }
                    </div>
                </div>
            </div>

            <div class="card bg-base-200">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">Default Transport</h2>
                    <select
                        class="select select-bordered select-sm w-full max-w-xs"
                        [value]="transportStore.activeTransport() ?? ''"
                        (change)="onTransportChange($any($event.target).value)"
                    >
                        @for (type of transportTypes; track type) {
                            <option [value]="type">{{ type }}</option>
                        }
                    </select>
                </div>
            </div>

            <div class="card bg-base-200">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">Scan Roots</h2>
                    <p class="text-xs opacity-60">Configured via SCAN_ROOTS environment variable on the server.</p>
                </div>
            </div>

            <div class="card bg-base-200">
                <div class="card-body gap-3">
                    <h2 class="card-title text-base">Database Path</h2>
                    <p class="text-xs opacity-60">Configured via DB_PATH environment variable on the server.</p>
                </div>
            </div>
        </div>
    `,
})
export class Settings {
    protected readonly themeSwitcher = inject(ThemeSwitcher);
    protected readonly transportStore = inject(TransportStore);

    protected readonly themes = THEMES;
    protected readonly transportTypes = TRANSPORT_TYPES;

    protected onTransportChange(type: TransportType): void {
        this.transportStore.setActiveTransport(type);
    }
}
