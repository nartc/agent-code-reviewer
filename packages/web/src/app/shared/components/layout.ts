import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { ThemeSwitcher } from '../../core/services/theme-switcher';
import type { Theme } from '../../core/services/theme-switcher';

@Component({
    selector: 'acr-layout',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, RouterLink],
    host: { class: 'flex flex-col min-h-screen' },
    template: `
        <div class="navbar bg-base-100 shadow-sm">
            <div class="flex-1">
                <a routerLink="/" class="btn btn-ghost text-xl">ACR</a>
            </div>
            <div class="flex-none gap-2">
                <button class="btn btn-ghost btn-sm" (click)="cycleTheme()">
                    @switch (themeSwitcher.resolvedTheme()) {
                        @case ('light') {
                            <span>Light</span>
                        }
                        @case ('dark') {
                            <span>Dark</span>
                        }
                    }
                </button>
                <a routerLink="/settings" class="btn btn-ghost btn-sm">Settings</a>
            </div>
        </div>
        <main class="flex-1">
            <router-outlet />
        </main>
    `,
})
export class Layout {
    protected readonly themeSwitcher = inject(ThemeSwitcher);

    protected cycleTheme(): void {
        const themes: Theme[] = ['light', 'dark', 'system'];
        const current = this.themeSwitcher.theme();
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        this.themeSwitcher.setTheme(next);
    }
}
