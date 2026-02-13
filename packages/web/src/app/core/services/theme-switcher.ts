import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

function readStoredTheme(): Theme {
    try {
        const stored = localStorage.getItem('acr-theme');
        if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
        // localStorage unavailable (e.g. Safari private browsing)
    }
    return 'system';
}

@Injectable({ providedIn: 'root' })
export class ThemeSwitcher {
    readonly #document = inject(DOCUMENT);

    readonly theme = signal<Theme>(readStoredTheme());

    readonly #systemPrefersDark = signal(
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : false,
    );

    readonly resolvedTheme = computed<'light' | 'dark'>(() => {
        if (this.theme() === 'system') {
            return this.#systemPrefersDark() ? 'dark' : 'light';
        }
        return this.theme() as 'light' | 'dark';
    });

    constructor() {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            mq.addEventListener('change', (e) => {
                this.#systemPrefersDark.set(e.matches);
            });
        }

        effect(() => {
            this.#document.documentElement.setAttribute('data-theme', this.resolvedTheme());
        });
    }

    setTheme(theme: Theme): void {
        this.theme.set(theme);
        try {
            localStorage.setItem('acr-theme', theme);
        } catch {
            // localStorage unavailable
        }
    }
}
