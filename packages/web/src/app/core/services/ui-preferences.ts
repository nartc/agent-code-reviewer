import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiPreferences {
	#readNumber(key: string, defaultValue: number): number {
		try {
			const stored = localStorage.getItem(key);
			if (stored == null) return defaultValue;
			const parsed = Number(stored);
			return Number.isNaN(parsed) ? defaultValue : parsed;
		} catch {
			return defaultValue;
		}
	}

	#readEnum<T extends string>(key: string, values: readonly T[], defaultValue: T): T {
		try {
			const stored = localStorage.getItem(key);
			if (stored == null) return defaultValue;
			return (values as readonly string[]).includes(stored) ? (stored as T) : defaultValue;
		} catch {
			return defaultValue;
		}
	}

	#readBoolean(key: string, defaultValue: boolean): boolean {
		try {
			const stored = localStorage.getItem(key);
			if (stored == null) return defaultValue;
			return stored === 'true';
		} catch {
			return defaultValue;
		}
	}

	readonly panelLeftWidth = signal(this.#readNumber('acr-left-panel-width', 250));
	readonly panelRightWidth = signal(this.#readNumber('acr-right-panel-width', 300));
	readonly diffStyle = signal(this.#readEnum('acr-diff-style', ['unified', 'split'] as const, 'unified'));
	readonly sidebarCollapsed = signal(this.#readBoolean('acr-sidebar-collapsed', false));

	setPanelLeftWidth(value: number): void {
		this.panelLeftWidth.set(value);
		try {
			localStorage.setItem('acr-left-panel-width', String(value));
		} catch {
			// localStorage unavailable
		}
	}

	setPanelRightWidth(value: number): void {
		this.panelRightWidth.set(value);
		try {
			localStorage.setItem('acr-right-panel-width', String(value));
		} catch {
			// localStorage unavailable
		}
	}

	setDiffStyle(value: 'unified' | 'split'): void {
		this.diffStyle.set(value);
		try {
			localStorage.setItem('acr-diff-style', value);
		} catch {
			// localStorage unavailable
		}
	}

	setSidebarCollapsed(value: boolean): void {
		this.sidebarCollapsed.set(value);
		try {
			localStorage.setItem('acr-sidebar-collapsed', String(value));
		} catch {
			// localStorage unavailable
		}
	}
}
