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

    // All files are under src/, so tree = 1 dir node + 5 file leaves = 6 li elements
    // Files sorted alphabetically: app.ts, moved.ts, new-file.ts, no-changes.ts, old-file.ts

    it('renders directory and file nodes', async () => {
        await fixture.whenStable();
        const items = el.querySelectorAll('li');
        // 1 directory (src) + 5 files
        expect(items.length).toBe(6);
    });

    it('shows correct status letters on file leaves', async () => {
        await fixture.whenStable();
        const badges = el.querySelectorAll('.badge');
        // Alphabetical order: app.ts(M), moved.ts(R), new-file.ts(A), no-changes.ts(M), old-file.ts(D)
        expect(badges[0].textContent!.trim()).toBe('M');  // app.ts
        expect(badges[1].textContent!.trim()).toBe('R');  // moved.ts
        expect(badges[2].textContent!.trim()).toBe('A');  // new-file.ts
        expect(badges[3].textContent!.trim()).toBe('M');  // no-changes.ts
        expect(badges[4].textContent!.trim()).toBe('D');  // old-file.ts
    });

    it('shows correct badge classes', async () => {
        await fixture.whenStable();
        const badges = el.querySelectorAll('.badge');
        // Alphabetical order: app.ts(warning), moved.ts(info), new-file.ts(success), no-changes.ts(warning), old-file.ts(error)
        expect(badges[0].classList.contains('badge-warning')).toBe(true);
        expect(badges[1].classList.contains('badge-info')).toBe(true);
        expect(badges[2].classList.contains('badge-success')).toBe(true);
        expect(badges[3].classList.contains('badge-warning')).toBe(true);
        expect(badges[4].classList.contains('badge-error')).toBe(true);
    });

    it('highlights active file', async () => {
        // activeFileIndex=0 maps to src/app.ts (first in mockFiles)
        // In tree: button[0] = src dir, button[1] = app.ts (active)
        host.activeFileIndex.set(0);
        await fixture.whenStable();
        const fileButtons = el.querySelectorAll('button');
        // button[0] is dir, button[1] is app.ts (active), etc
        expect(fileButtons[1].classList.contains('text-primary')).toBe(true);
        expect(fileButtons[2].classList.contains('text-primary')).toBe(false);
    });

    it('emits fileSelected with original index on click', async () => {
        await fixture.whenStable();
        const buttons = el.querySelectorAll('button');
        // button[0] = src dir, button[1] = app.ts (idx 0), button[2] = moved.ts (idx 3)
        buttons[2].click(); // moved.ts
        await fixture.whenStable();
        expect(host.selectedIndex()).toBe(3);
    });

    it('shows addition/deletion counts', async () => {
        await fixture.whenStable();
        // First file leaf is app.ts (second <li>, index 1)
        const fileItems = el.querySelectorAll('li');
        const appTsItem = fileItems[1]; // first file leaf (app.ts)
        expect(appTsItem.querySelector('.text-success')!.textContent!.trim()).toBe('+5');
        expect(appTsItem.querySelector('.text-error')!.textContent!.trim()).toBe('-2');
    });

    it('hides zero counts', async () => {
        await fixture.whenStable();
        // no-changes.ts is 4th file alphabetically → index 4 in li list (0=dir, 1-5=files)
        const fileItems = el.querySelectorAll('li');
        const noChangesItem = fileItems[4]; // no-changes.ts
        expect(noChangesItem.querySelector('.text-success')).toBeNull();
        expect(noChangesItem.querySelector('.text-error')).toBeNull();
    });

    it('shows empty state when no files', async () => {
        host.files.set([]);
        await fixture.whenStable();
        expect(el.querySelectorAll('li').length).toBe(0);
        expect(el.textContent).toContain('No files');
    });

    it('collapses directory on click', async () => {
        await fixture.whenStable();
        const dirButton = el.querySelectorAll('button')[0];
        expect(el.querySelectorAll('li').length).toBe(6);

        dirButton.click();
        await fixture.whenStable();

        // After collapse: only dir node visible
        expect(el.querySelectorAll('li').length).toBe(1);
    });

    it('shows title attribute with full path', async () => {
        await fixture.whenStable();
        const buttons = el.querySelectorAll('button');
        expect(buttons[0].getAttribute('title')).toBe('src');
        expect(buttons[1].getAttribute('title')).toBe('src/app.ts');
    });
});
