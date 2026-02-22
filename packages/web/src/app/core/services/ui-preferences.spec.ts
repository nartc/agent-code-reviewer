import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiPreferences } from './ui-preferences';

describe('UiPreferences', () => {
    let service: UiPreferences;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [provideZonelessChangeDetection()],
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('AC-1: is injectable at root', () => {
        service = TestBed.inject(UiPreferences);
        expect(service).toBeTruthy();
    });

    it('AC-2: returns default values when localStorage is empty', () => {
        service = TestBed.inject(UiPreferences);
        expect(service.panelLeftWidth()).toBe(250);
        expect(service.panelRightWidth()).toBe(300);
        expect(service.diffStyle()).toBe('unified');
        expect(service.sidebarCollapsed()).toBe(false);
    });

    it('AC-3: round-trip set/get for number', () => {
        service = TestBed.inject(UiPreferences);
        service.setPanelLeftWidth(400);
        expect(service.panelLeftWidth()).toBe(400);
        expect(localStorage.getItem('acr-left-panel-width')).toBe('400');
    });

    it('AC-4: round-trip set/get for enum', () => {
        service = TestBed.inject(UiPreferences);
        service.setDiffStyle('split');
        expect(service.diffStyle()).toBe('split');
        expect(localStorage.getItem('acr-diff-style')).toBe('split');
    });

    it('AC-5: round-trip set/get for boolean', () => {
        service = TestBed.inject(UiPreferences);
        service.setSidebarCollapsed(true);
        expect(service.sidebarCollapsed()).toBe(true);
        expect(localStorage.getItem('acr-sidebar-collapsed')).toBe('true');
    });

    it('AC-6: returns defaults when localStorage.getItem throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        service = TestBed.inject(UiPreferences);
        expect(service.panelLeftWidth()).toBe(250);
        expect(service.panelRightWidth()).toBe(300);
        expect(service.diffStyle()).toBe('unified');
        expect(service.sidebarCollapsed()).toBe(false);
    });

    it('AC-7: signal updates even when localStorage.setItem throws', () => {
        service = TestBed.inject(UiPreferences);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        service.setPanelLeftWidth(500);
        expect(service.panelLeftWidth()).toBe(500);
    });

    it('AC-8: invalid stored number falls back to default', () => {
        localStorage.setItem('acr-left-panel-width', 'not-a-number');
        service = TestBed.inject(UiPreferences);
        expect(service.panelLeftWidth()).toBe(250);
    });

    it('AC-9: invalid stored enum falls back to default', () => {
        localStorage.setItem('acr-diff-style', 'garbage');
        service = TestBed.inject(UiPreferences);
        expect(service.diffStyle()).toBe('unified');
    });

    it('AC-10: invalid stored boolean treated as false', () => {
        localStorage.setItem('acr-sidebar-collapsed', 'garbage');
        service = TestBed.inject(UiPreferences);
        expect(service.sidebarCollapsed()).toBe(false);
    });

    it('AC-11: restores valid stored values on init', () => {
        localStorage.setItem('acr-left-panel-width', '400');
        localStorage.setItem('acr-right-panel-width', '500');
        localStorage.setItem('acr-diff-style', 'split');
        localStorage.setItem('acr-sidebar-collapsed', 'true');
        service = TestBed.inject(UiPreferences);
        expect(service.panelLeftWidth()).toBe(400);
        expect(service.panelRightWidth()).toBe(500);
        expect(service.diffStyle()).toBe('split');
        expect(service.sidebarCollapsed()).toBe(true);
    });
});
