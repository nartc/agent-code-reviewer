import type { TransportType } from '@agent-code-reviewer/shared';
import { Location, TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ThemeSwitcher, type Theme } from '../../core/services/theme-switcher';
import { TransportStore } from '../../core/stores/transport-store';

const THEMES: Theme[] = ['light', 'dark', 'system'];
const THEME_ICONS: Record<Theme, string> = { light: 'lucideSun', dark: 'lucideMoon', system: 'lucideMonitor' };
const TRANSPORT_TYPES: TransportType[] = ['tmux', 'mcp', 'clipboard'];

@Component({
    selector: 'acr-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TitleCasePipe, NgIcon],
    template: `
        <div class="max-w-2xl mx-auto p-6 flex flex-col gap-6">
            <div class="flex items-center gap-3">
                <button class="btn btn-sm btn-ghost inline-flex items-center gap-1" (click)="location.back()">
                    <ng-icon name="lucideArrowLeft" class="size-4" />
                    Back
                </button>
                <h1 class="text-2xl font-bold">Settings</h1>
            </div>

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
                                <ng-icon [name]="themeIcons[t]" class="size-4" />
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
                        aria-label="Default transport"
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
    protected readonly location = inject(Location);
    protected readonly themeSwitcher = inject(ThemeSwitcher);
    protected readonly transportStore = inject(TransportStore);

    protected readonly themes = THEMES;
    protected readonly themeIcons = THEME_ICONS;
    protected readonly transportTypes = TRANSPORT_TYPES;

    protected onTransportChange(type: TransportType): void {
        this.transportStore.setActiveTransport(type);
    }
}
