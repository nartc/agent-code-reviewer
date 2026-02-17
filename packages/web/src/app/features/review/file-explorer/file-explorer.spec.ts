import type { FileSummary } from '@agent-code-reviewer/shared';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileExplorer } from './file-explorer';

const mockFiles: FileSummary[] = [
    { path: 'src/app.ts', status: 'modified', additions: 5, deletions: 2 },
    { path: 'src/new-file.ts', status: 'added', additions: 10, deletions: 0 },
    { path: 'src/old-file.ts', status: 'deleted', additions: 0, deletions: 8 },
    { path: 'src/moved.ts', status: 'renamed', additions: 1, deletions: 1 },
    { path: 'src/no-changes.ts', status: 'modified', additions: 0, deletions: 0 },
];

@Component({
    imports: [FileExplorer],
    template: `
        <acr-file-explorer
            [files]="files()"
            [activeFileIndex]="activeFileIndex()"
            (fileSelected)="selectedIndex.set($event)"
        />
    `,
})
class TestHost {
    files = signal<FileSummary[]>(mockFiles);
    activeFileIndex = signal(0);
    selectedIndex = signal<number | null>(null);
}

describe('FileExplorer', () => {
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

    it('renders all files', async () => {
        await fixture.whenStable();
        const items = el.querySelectorAll('li');
        expect(items.length).toBe(5);
    });

    it('shows correct status letters', async () => {
        await fixture.whenStable();
        const badges = el.querySelectorAll('.badge');
        expect(badges[0].textContent!.trim()).toBe('M');
        expect(badges[1].textContent!.trim()).toBe('A');
        expect(badges[2].textContent!.trim()).toBe('D');
        expect(badges[3].textContent!.trim()).toBe('R');
    });

    it('shows correct badge classes', async () => {
        await fixture.whenStable();
        const badges = el.querySelectorAll('.badge');
        expect(badges[0].classList.contains('badge-warning')).toBe(true);
        expect(badges[1].classList.contains('badge-success')).toBe(true);
        expect(badges[2].classList.contains('badge-error')).toBe(true);
        expect(badges[3].classList.contains('badge-info')).toBe(true);
    });

    it('highlights active file', async () => {
        host.activeFileIndex.set(2);
        await fixture.whenStable();
        const buttons = el.querySelectorAll('button');
        expect(buttons[2].classList.contains('active')).toBe(true);
        expect(buttons[0].classList.contains('active')).toBe(false);
    });

    it('emits fileSelected on click', async () => {
        await fixture.whenStable();
        const buttons = el.querySelectorAll('button');
        buttons[3].click();
        await fixture.whenStable();
        expect(host.selectedIndex()).toBe(3);
    });

    it('shows addition/deletion counts', async () => {
        await fixture.whenStable();
        const firstItem = el.querySelectorAll('li')[0];
        expect(firstItem.querySelector('.text-success')!.textContent!.trim()).toBe('+5');
        expect(firstItem.querySelector('.text-error')!.textContent!.trim()).toBe('-2');
    });

    it('hides zero counts', async () => {
        await fixture.whenStable();
        const lastItem = el.querySelectorAll('li')[4];
        expect(lastItem.querySelector('.text-success')).toBeNull();
        expect(lastItem.querySelector('.text-error')).toBeNull();
    });

    it('shows empty state when no files', async () => {
        host.files.set([]);
        await fixture.whenStable();
        expect(el.querySelectorAll('li').length).toBe(0);
        expect(el.textContent).toContain('No files');
    });
});
