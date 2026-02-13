import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

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
    readonly #destroyRef = inject(DestroyRef);
    readonly #document = inject(DOCUMENT);
    readonly #window = this.#document.defaultView;

    readonly theme = signal<Theme>(readStoredTheme());

    readonly #systemPrefersDark = signal(
        this.#window != null && typeof this.#window.matchMedia === 'function'
            ? this.#window.matchMedia('(prefers-color-scheme: dark)').matches
            : false,
    );

    readonly resolvedTheme = computed<'light' | 'dark'>(() => {
        if (this.theme() === 'system') {
            return this.#systemPrefersDark() ? 'dark' : 'light';
        }
        return this.theme() as 'light' | 'dark';
    });

    constructor() {
        if (this.#window != null && typeof this.#window.matchMedia === 'function') {
            const mq = this.#window.matchMedia('(prefers-color-scheme: dark)');

            const cb = (e: MediaQueryListEvent) => {
                this.#systemPrefersDark.set(e.matches);
            };

            mq.addEventListener('change', cb);
            this.#destroyRef.onDestroy(() => mq.removeEventListener('change', cb));
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
