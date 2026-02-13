import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import type { Theme } from '../../core/services/theme-switcher';
import { ThemeSwitcher } from '../../core/services/theme-switcher';

const themes: Theme[] = ['light', 'dark', 'system'];

@Component({
    selector: 'acr-layout',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, RouterLink, TitleCasePipe],
    host: { class: 'flex flex-col min-h-screen' },
    template: `
        <nav class="navbar bg-base-100 shadow-sm">
            <div class="flex-1">
                <a routerLink="/" class="btn btn-ghost text-xl">ACR</a>
            </div>
            <div class="flex-none gap-2">
                <button class="btn btn-ghost btn-sm" (click)="cycleTheme()">
                    @switch (themeSwitcher.theme()) {
                        @case ('light') {
                            <span>Light</span>
                        }
                        @case ('dark') {
                            <span>Dark</span>
                        }
                        @case ('system') {
                            <span>System ({{ themeSwitcher.resolvedTheme() | titlecase }})</span>
                        }
                    }
                </button>
                <a routerLink="/settings" class="btn btn-ghost btn-sm">Settings</a>
            </div>
        </nav>
        <main class="flex-1">
            <router-outlet />
        </main>
    `,
})
export class Layout {
    protected readonly themeSwitcher = inject(ThemeSwitcher);

    protected cycleTheme(): void {
        const current = this.themeSwitcher.theme();
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        this.themeSwitcher.setTheme(next);
    }
}
