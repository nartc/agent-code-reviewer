import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import type { Theme } from '../../core/services/theme-switcher';
import { ThemeSwitcher } from '../../core/services/theme-switcher';

const themes: Theme[] = ['light', 'dark', 'system'];
const themeIcons: Record<Theme, string> = { light: 'lucideSun', dark: 'lucideMoon', system: 'lucideMonitor' };

@Component({
    selector: 'acr-layout',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, RouterLink, NgIcon],
    host: { class: 'flex flex-col h-screen' },
    template: `
        <nav class="navbar bg-base-100 shadow-sm">
            <div class="flex-1">
                <a routerLink="/" class="btn btn-ghost text-xl">ACR</a>
            </div>
            <div class="flex-none gap-2">
                <button class="btn btn-ghost btn-sm" title="Toggle theme" (click)="cycleTheme()">
                    <ng-icon [name]="themeIcons[themeSwitcher.theme()]" class="size-4" />
                </button>
                <a routerLink="/settings" class="btn btn-ghost btn-sm" title="Settings">
                    <ng-icon name="lucideSettings" class="size-4" />
                </a>
            </div>
        </nav>
        <main class="flex flex-col flex-1 overflow-auto">
            <router-outlet />
        </main>
    `,
})
export class Layout {
    protected readonly themeSwitcher = inject(ThemeSwitcher);
    protected readonly themeIcons = themeIcons;

    protected cycleTheme(): void {
        const current = this.themeSwitcher.theme();
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        this.themeSwitcher.setTheme(next);
    }
}
