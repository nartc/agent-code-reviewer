import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResizeHandle } from './resize-handle';

@Component({
    imports: [ResizeHandle],
    template: `
        <acr-resize-handle [direction]="direction()" (resized)="onResized($event)" />
    `,
})
class TestHost {
    direction = signal<'horizontal' | 'vertical'>('horizontal');
    deltas: number[] = [];
    onResized(delta: number): void {
        this.deltas.push(delta);
    }
}

describe('ResizeHandle', () => {
    let fixture: ComponentFixture<TestHost>;
    let host: TestHost;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TestHost],
        }).compileComponents();
        fixture = TestBed.createComponent(TestHost);
        host = fixture.componentInstance;
        fixture.autoDetectChanges();
    });

    it('has cursor-col-resize class when horizontal', async () => {
        host.direction.set('horizontal');
        await fixture.whenStable();
        const el = (fixture.nativeElement as HTMLElement).querySelector('acr-resize-handle') as HTMLElement;
        expect(el.classList.contains('cursor-col-resize')).toBe(true);
    });

    it('has cursor-row-resize class when vertical', async () => {
        host.direction.set('vertical');
        await fixture.whenStable();
        const el = (fixture.nativeElement as HTMLElement).querySelector('acr-resize-handle') as HTMLElement;
        expect(el.classList.contains('cursor-row-resize')).toBe(true);
    });

    it('has block and select-none classes', async () => {
        await fixture.whenStable();
        const el = (fixture.nativeElement as HTMLElement).querySelector('acr-resize-handle') as HTMLElement;
        expect(el.classList.contains('block')).toBe(true);
        expect(el.classList.contains('select-none')).toBe(true);
    });
});
