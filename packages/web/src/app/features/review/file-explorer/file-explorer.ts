import type { FileSummary } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { buildFileTree, flattenTree } from './build-file-tree';

@Component({
    selector: 'acr-file-explorer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIcon],
    host: { class: 'flex flex-col' },
    template: `
        @if (files().length === 0) {
            <p class="p-2 text-xs opacity-50">No files</p>
        } @else {
            <ul class="menu menu-sm">
                @for (entry of flatEntries(); track entry.node.fullPath) {
                    <li>
                        @if (entry.isDir) {
                            <button
                                class="flex items-center gap-2 font-mono text-xs"
                                [style.padding-left.rem]="entry.depth * 1"
                                [title]="entry.node.fullPath"
                                [attr.aria-expanded]="!isCollapsed(entry.node.fullPath)"
                                (click)="toggleDir(entry.node.fullPath)"
                            >
                                <ng-icon [name]="isCollapsed(entry.node.fullPath) ? 'lucideChevronRight' : 'lucideChevronDown'" class="size-3" />
                                <span class="truncate flex-1">{{ entry.node.name }}</span>
                            </button>
                        } @else {
                            <button
                                class="flex items-center gap-2 font-mono text-xs"
                                [class.bg-primary/10]="isActive(entry.node)"
                                [class.text-primary]="isActive(entry.node)"
                                [style.padding-left.rem]="entry.depth * 1"
                                [title]="entry.node.fullPath"
                                (click)="onFileClick(entry.node)"
                            >
                                <span class="badge badge-xs" [class]="statusClass(entry.node.file!.status)">
                                    {{ statusLetter(entry.node.file!.status) }}
                                </span>
                                <span class="truncate flex-1">{{ entry.node.name }}</span>
                                @if (isChanged(entry.node.file!.path)) {
                                    <span class="badge badge-xs badge-accent" title="Changed in this snapshot">●</span>
                                }
                                @if (entry.node.file!.additions > 0) {
                                    <span class="text-success">+{{ entry.node.file!.additions }}</span>
                                }
                                @if (entry.node.file!.deletions > 0) {
                                    <span class="text-error">-{{ entry.node.file!.deletions }}</span>
                                }
                            </button>
                        }
                    </li>
                }
            </ul>
        }
    `,
})
export class FileExplorer {
    readonly files = input.required<FileSummary[]>();
    readonly activeFileIndex = input.required<number>();
    readonly changedFiles = input<string[]>([]);
    readonly fileSelected = output<number>();

    readonly collapsedPaths = signal<Set<string>>(new Set());

    protected readonly tree = computed(() => buildFileTree(this.files()));

    protected readonly flatEntries = computed(() =>
        flattenTree(this.tree(), this.collapsedPaths()),
    );

    protected isCollapsed(fullPath: string): boolean {
        return this.collapsedPaths().has(fullPath);
    }

    protected toggleDir(fullPath: string): void {
        const current = this.collapsedPaths();
        const next = new Set(current);
        if (next.has(fullPath)) {
            next.delete(fullPath);
        } else {
            next.add(fullPath);
        }
        this.collapsedPaths.set(next);
    }

    protected isActive(node: { file?: FileSummary }): boolean {
        if (!node.file) return false;
        const files = this.files();
        const activeFile = files[this.activeFileIndex()];
        return activeFile?.path === node.file.path;
    }

    protected onFileClick(node: { file?: FileSummary }): void {
        if (!node.file) return;
        const idx = this.files().findIndex((f) => f.path === node.file!.path);
        if (idx >= 0) {
            this.fileSelected.emit(idx);
        }
    }

    protected isChanged(filePath: string): boolean {
        return this.changedFiles().includes(filePath);
    }

    protected statusLetter(status: FileSummary['status']): string {
        switch (status) {
            case 'added': return 'A';
            case 'modified': return 'M';
            case 'deleted': return 'D';
            case 'renamed': return 'R';
            default: return '?';
        }
    }

    protected statusClass(status: FileSummary['status']): string {
        switch (status) {
            case 'added': return 'badge-success';
            case 'modified': return 'badge-warning';
            case 'deleted': return 'badge-error';
            case 'renamed': return 'badge-info';
            default: return '';
        }
    }
}
