import type { SnapshotSummary } from '@agent-code-reviewer/shared';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SnapshotTimeline } from './snapshot-timeline';

function makeSummary(id: string, createdAt: string, hasReviewComments = false): SnapshotSummary {
    return {
        id,
        session_id: 'sess-1',
        files_summary: [],
        head_commit: 'abc123',
        trigger: 'manual',
        changed_files: ['file1.ts'],
        has_review_comments: hasReviewComments,
        created_at: createdAt,
    } as SnapshotSummary;
}

// newest-first order (matches store convention)
const mockSnapshots: SnapshotSummary[] = [
    makeSummary('snap-5', '2024-01-05T00:00:00Z'),
    makeSummary('snap-4', '2024-01-04T00:00:00Z', true),
    makeSummary('snap-3', '2024-01-03T00:00:00Z'),
    makeSummary('snap-2', '2024-01-02T00:00:00Z', true),
    makeSummary('snap-1', '2024-01-01T00:00:00Z'),
];

@Component({
    imports: [SnapshotTimeline],
    template: `
        <acr-snapshot-timeline
            [snapshots]="snapshots()"
            [activeSnapshotId]="activeSnapshotId()"
            [hasNewChanges]="hasNewChanges()"
            (snapshotSelected)="selectedId.set($event)"
            (jumpToLatest)="jumpedToLatest.set(true)"
        />
    `,
})
class TestHost {
    snapshots = signal<SnapshotSummary[]>(mockSnapshots);
    activeSnapshotId = signal<string | null>('snap-3');
    hasNewChanges = signal(false);
    selectedId = signal<string | null>(null);
    jumpedToLatest = signal(false);
}

describe('SnapshotTimeline', () => {
    let fixture: ComponentFixture<TestHost>;
    let host: TestHost;
    let el: HTMLElement;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TestHost],
        }).compileComponents();
        fixture = TestBed.createComponent(TestHost);
        host = fixture.componentInstance;
        el = fixture.nativeElement;
        fixture.autoDetectChanges();
    });

    it('renders correct number of dot buttons', async () => {
        await fixture.whenStable();
        const dots = el.querySelectorAll('.rounded-full[style*="left"]');
        expect(dots.length).toBe(5);
    });

    it('active dot has bg-primary and larger size', async () => {
        await fixture.whenStable();
        const dots = el.querySelectorAll('.rounded-full[style*="left"]');
        const activeDot = Array.from(dots).find((d) => d.classList.contains('bg-primary'));
        expect(activeDot).toBeTruthy();
        expect(activeDot!.classList.contains('w-4')).toBe(true);
        expect(activeDot!.classList.contains('h-4')).toBe(true);
    });

    it('review comment dots have warning styling', async () => {
        await fixture.whenStable();
        const warningDots = el.querySelectorAll('.bg-warning');
        expect(warningDots.length).toBe(2);
    });

    it('emits snapshotSelected on dot click', async () => {
        await fixture.whenStable();
        const dots = el.querySelectorAll('.rounded-full[style*="left"]') as NodeListOf<HTMLButtonElement>;
        // Click the first dot (snap-5 is newest = leftmost based on timestamps)
        // Find the dot for snap-1 (oldest)
        const snap1Dot = Array.from(dots).find((d) => d.getAttribute('title')?.startsWith('snap-1'));
        snap1Dot!.click();
        await fixture.whenStable();
        expect(host.selectedId()).toBe('snap-1');
    });

    it('prev navigates to older snapshot', async () => {
        await fixture.whenStable();
        const prevBtn = el.querySelectorAll('button')[0];
        prevBtn.click();
        await fixture.whenStable();
        // active is snap-3 (index 2), prev goes to snap-2 (index 3)
        expect(host.selectedId()).toBe('snap-2');
    });

    it('next navigates to newer snapshot', async () => {
        await fixture.whenStable();
        const navBtns = el.querySelectorAll('.btn.btn-ghost');
        // First nav btn is prev, second is next
        const nextBtn = navBtns[1] as HTMLButtonElement;
        nextBtn.click();
        await fixture.whenStable();
        // active is snap-3 (index 2), next goes to snap-4 (index 1)
        expect(host.selectedId()).toBe('snap-4');
    });

    it('shows Latest button when not viewing latest', async () => {
        await fixture.whenStable();
        const latestBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Latest'));
        expect(latestBtn).toBeTruthy();
    });

    it('hides Latest button when viewing latest', async () => {
        host.activeSnapshotId.set('snap-5');
        await fixture.whenStable();
        const latestBtn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Latest'));
        expect(latestBtn).toBeFalsy();
    });

    it('shows error badge on Latest button when hasNewChanges', async () => {
        host.hasNewChanges.set(true);
        await fixture.whenStable();
        const badge = el.querySelector('.badge-error');
        expect(badge).toBeTruthy();
    });

    it('clicking Latest emits jumpToLatest', async () => {
        await fixture.whenStable();
        const latestBtn = Array.from(el.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Latest'),
        ) as HTMLButtonElement;
        latestBtn.click();
        await fixture.whenStable();
        expect(host.jumpedToLatest()).toBe(true);
    });

    it('single snapshot renders dot at 50%', async () => {
        host.snapshots.set([makeSummary('only-1', '2024-01-01T00:00:00Z')]);
        host.activeSnapshotId.set('only-1');
        await fixture.whenStable();
        const dot = el.querySelector('.rounded-full[style*="left"]') as HTMLElement;
        expect(dot).toBeTruthy();
        expect(dot.style.left).toBe('50%');
    });

    it('empty snapshots renders no dots', async () => {
        host.snapshots.set([]);
        host.activeSnapshotId.set(null);
        await fixture.whenStable();
        const dots = el.querySelectorAll('.rounded-full[style*="left"]');
        expect(dots.length).toBe(0);
    });
});
