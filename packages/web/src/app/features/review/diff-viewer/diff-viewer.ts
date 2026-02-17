import type { Comment } from '@agent-code-reviewer/shared';
import type { DiffLineAnnotation, FileDiffMetadata, OnDiffLineClickProps } from '@pierre/diffs';
import { parsePatchFiles } from '@pierre/diffs';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CommentStore } from '../../../core/stores/comment-store';
import { SessionStore } from '../../../core/stores/session-store';
import type { AnnotationMeta } from './annotation-meta';
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
                    [lineAnnotations]="annotations()"
                    (lineNumberClicked)="onLineNumberClick($event)"
                    (formSaved)="onFormSaved($event)"
                    (formCancelled)="onFormCancelled()"
                    (indicatorClicked)="onIndicatorClicked($event)"
                />
            }
        }
    `,
})
export class DiffViewer {
    protected readonly store = inject(SessionStore);
    protected readonly diffStyle = signal<'unified' | 'split'>('unified');

    readonly #commentStore = inject(CommentStore);
    readonly #fileDiff = viewChild(AcrFileDiff);

    readonly #activeForm = signal<AnnotationMeta | null>(null);

    protected readonly parsedFiles = computed<FileDiffMetadata[]>(() => {
        const diff = this.store.currentDiff();
        if (!diff?.raw_diff) return [];
        return parsePatchFiles(diff.raw_diff)[0]?.files ?? [];
    });

    protected readonly activeMetadata = computed(() => this.parsedFiles()[this.store.activeFileIndex()] ?? null);

    protected readonly annotations = computed<DiffLineAnnotation<AnnotationMeta>[]>(() => {
        const meta = this.activeMetadata();
        if (!meta) return [];

        const fileName = meta.name;
        const comments = this.#commentStore.comments();
        const result: DiffLineAnnotation<AnnotationMeta>[] = [];

        // Build indicator annotations from comments on this file
        const lineMap = new Map<string, { count: number; ids: string[] }>();
        for (const thread of comments) {
            const c = thread.comment;
            if (c.file_path !== fileName || c.line_start == null) continue;
            const key = `${c.side ?? 'new'}-${c.line_start}`;
            const existing = lineMap.get(key) ?? { count: 0, ids: [] };
            existing.count++;
            existing.ids.push(c.id);
            lineMap.set(key, existing);
        }

        for (const [key, data] of lineMap) {
            const [side, lineStr] = key.split('-');
            result.push({
                side: side === 'old' ? 'deletions' : 'additions',
                lineNumber: Number(lineStr),
                metadata: { type: 'indicator', count: data.count, commentIds: data.ids },
            });
        }

        // Add active form annotation if present
        const form = this.#activeForm();
        if (form && form.type === 'form') {
            result.push({
                side: form.side === 'old' ? 'deletions' : 'additions',
                lineNumber: form.lineStart,
                metadata: form,
            });
        }

        return result;
    });

    constructor() {
        // Clear active form when file changes
        effect(() => {
            this.store.activeFileIndex();
            this.#activeForm.set(null);
        });
    }

    protected onLineNumberClick(event: { lineNumber: number; side: 'old' | 'new' }): void {
        const snapshotId = this.store.activeSnapshotId();
        const sessionId = this.store.currentSession()?.id;
        const meta = this.activeMetadata();
        if (!snapshotId || !sessionId || !meta) return;

        this.#activeForm.set({
            type: 'form',
            filePath: meta.name,
            lineStart: event.lineNumber,
            side: event.side,
            snapshotId,
            sessionId,
        });
    }

    protected onFormSaved(_comment: Comment): void {
        this.#activeForm.set(null);
    }

    protected onFormCancelled(): void {
        this.#activeForm.set(null);
    }

    protected onIndicatorClicked(_commentIds: string[]): void {
        // Future: scroll to comment in panel, highlight
    }
}
