import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { provideZonelessChangeDetection } from '@angular/core';
import { ThemeSwitcher } from './theme-switcher';

describe('ThemeSwitcher', () => {
    let service: ThemeSwitcher;
    let doc: Document;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideZonelessChangeDetection()],
        });
        doc = TestBed.inject(DOCUMENT);
    });

    it('defaults to system when no localStorage value', () => {
        service = TestBed.inject(ThemeSwitcher);
        expect(service.theme()).toBe('system');
    });

    it('setTheme updates theme signal and localStorage', () => {
        service = TestBed.inject(ThemeSwitcher);
        service.setTheme('dark');
        expect(service.theme()).toBe('dark');
        expect(service.resolvedTheme()).toBe('dark');
        expect(localStorage.getItem('acr-theme')).toBe('dark');
    });

    it('resolvedTheme returns dark when system prefers dark', () => {
        service = TestBed.inject(ThemeSwitcher);
        expect(service.theme()).toBe('system');
        const resolved = service.resolvedTheme();
        expect(resolved === 'light' || resolved === 'dark').toBe(true);
    });

    it('resolvedTheme returns light when theme is light', () => {
        service = TestBed.inject(ThemeSwitcher);
        service.setTheme('light');
        expect(service.resolvedTheme()).toBe('light');
    });

    it('sets data-theme attribute on documentElement', () => {
        service = TestBed.inject(ThemeSwitcher);
        TestBed.flushEffects();
        service.setTheme('dark');
        TestBed.flushEffects();
        expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('restores theme from localStorage on init', () => {
        localStorage.setItem('acr-theme', 'dark');
        service = TestBed.inject(ThemeSwitcher);
        expect(service.theme()).toBe('dark');
    });

    it('ignores invalid localStorage values', () => {
        localStorage.setItem('acr-theme', 'invalid-value');
        service = TestBed.inject(ThemeSwitcher);
        expect(service.theme()).toBe('system');
    });
});
