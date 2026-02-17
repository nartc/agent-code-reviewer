import type { FileSummary } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
    selector: 'acr-file-explorer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col' },
    template: `
        @if (files().length === 0) {
            <p class="p-2 text-xs opacity-50">No files</p>
        } @else {
            <ul class="menu menu-sm">
                @for (file of files(); track file.path; let i = $index) {
                    <li>
                        <button
                            [class.active]="i === activeFileIndex()"
                            (click)="fileSelected.emit(i)"
                            class="flex items-center gap-2 font-mono text-xs"
                        >
                            <span class="badge badge-xs" [class]="statusClass(file.status)">
                                {{ statusLetter(file.status) }}
                            </span>
                            <span class="truncate flex-1">{{ file.path }}</span>
                            @if (file.additions > 0) {
                                <span class="text-success">+{{ file.additions }}</span>
                            }
                            @if (file.deletions > 0) {
                                <span class="text-error">-{{ file.deletions }}</span>
                            }
                        </button>
                    </li>
                }
            </ul>
        }
    `,
})
export class FileExplorer {
    readonly files = input.required<FileSummary[]>();
    readonly activeFileIndex = input.required<number>();
    readonly fileSelected = output<number>();

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
