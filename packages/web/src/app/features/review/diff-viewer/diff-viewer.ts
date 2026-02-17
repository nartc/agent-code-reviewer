import type { FileDiffMetadata, OnDiffLineClickProps } from '@pierre/diffs';
import { parsePatchFiles } from '@pierre/diffs';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionStore } from '../../../core/stores/session-store';
import { AcrFileDiff } from './file-diff';

@Component({
    selector: 'acr-diff-viewer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AcrFileDiff],
    host: { class: 'flex flex-col flex-1 overflow-hidden' },
    template: `
        @if (!store.currentDiff()) {
            <div class="flex justify-center py-12">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
        } @else if (parsedFiles().length === 0) {
            <div class="p-4 opacity-50">No files changed</div>
        } @else {
            <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300">
                <button class="btn btn-xs btn-ghost" (click)="store.prevFile()">
                    &lt;
                </button>
                <span class="font-mono text-xs truncate flex-1">{{ activeMetadata()?.name }}</span>
                <span class="text-xs opacity-50 whitespace-nowrap">
                    {{ store.activeFileIndex() + 1 }} / {{ store.totalFiles() }}
                </span>
                <button class="btn btn-xs btn-ghost" (click)="store.nextFile()">
                    &gt;
                </button>
            </div>

            <div class="flex items-center gap-1 px-4 py-1 border-b border-base-300">
                <button
                    class="btn btn-xs"
                    [class.btn-active]="diffStyle() === 'unified'"
                    (click)="diffStyle.set('unified')"
                >
                    Unified
                </button>
                <button
                    class="btn btn-xs"
                    [class.btn-active]="diffStyle() === 'split'"
                    (click)="diffStyle.set('split')"
                >
                    Split
                </button>
            </div>

            @if (activeMetadata(); as meta) {
                <acr-file-diff
                    [metadata]="meta"
                    [diffStyle]="diffStyle()"
                    (lineClicked)="onLineClick($event)"
                />
            }
        }
    `,
})
export class DiffViewer {
    protected readonly store = inject(SessionStore);
    protected readonly diffStyle = signal<'unified' | 'split'>('unified');

    protected readonly parsedFiles = computed<FileDiffMetadata[]>(() => {
        const diff = this.store.currentDiff();
        if (!diff?.raw_diff) return [];
        return parsePatchFiles(diff.raw_diff)[0]?.files ?? [];
    });

    protected readonly activeMetadata = computed(() => this.parsedFiles()[this.store.activeFileIndex()] ?? null);

    protected onLineClick(props: OnDiffLineClickProps): void {
        // Phase 10: log only — comment integration in Phase 11
        console.log('Line clicked:', props);
    }
}
