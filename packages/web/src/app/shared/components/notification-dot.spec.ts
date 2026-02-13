import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { NotificationDot } from './notification-dot';

@Component({
    imports: [NotificationDot],
    template: `<acr-notification-dot [visible]="visible()" [count]="count()" />`,
})
class TestHost {
    visible = signal(false);
    count = signal<number | null>(null);
}

describe('NotificationDot', () => {
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

    it('renders nothing when visible is false', async () => {
        host.visible.set(false);
        await fixture.whenStable();
        const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge');
        expect(badge).toBeNull();
    });

    it('renders empty badge when visible and count is null', async () => {
        host.visible.set(true);
        host.count.set(null);
        await fixture.whenStable();
        const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge');
        expect(badge).toBeTruthy();
        expect(badge!.textContent!.trim()).toBe('');
    });

    it('renders count when visible and count > 0', async () => {
        host.visible.set(true);
        host.count.set(3);
        await fixture.whenStable();
        const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge');
        expect(badge).toBeTruthy();
        expect(badge!.textContent!.trim()).toBe('3');
    });

    it('renders empty badge when count is 0', async () => {
        host.visible.set(true);
        host.count.set(0);
        await fixture.whenStable();
        const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge');
        expect(badge).toBeTruthy();
        expect(badge!.textContent!.trim()).toBe('');
    });
});
