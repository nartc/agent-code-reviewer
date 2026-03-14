import type { Comment, CommentThread } from '@agent-code-reviewer/shared';
import {
    ChangeDetectionStrategy,
    Component,
    afterRenderEffect,
    computed,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgIcon } from '@ng-icons/core';
import { of } from 'rxjs';
import type { DiffLineAnnotation, FileContents, FileDiffMetadata } from '@pierre/diffs';
import { parseDiffFromFile, parsePatchFiles } from '@pierre/diffs';
import { ApiClient } from '../../../core/services/api-client';
import { ThemeSwitcher } from '../../../core/services/theme-switcher';
import { UiPreferences } from '../../../core/services/ui-preferences';
import { CommentStore } from '../../../core/stores/comment-store';
import { SessionStore } from '../../../core/stores/session-store';
import type { AnnotationMeta } from './annotation-meta';
import { AcrFileDiff } from './file-diff';
import { InlineComment } from './inline-comment';
import { InlineCommentForm } from './inline-comment-form';

@Component({
    selector: 'acr-diff-viewer',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [AcrFileDiff, InlineCommentForm, NgIcon, InlineComment],
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
                <span class="font-mono text-xs truncate flex-1">{{ activeMetadata()?.name }}</span>
                <div class="flex items-center">
                    <button class="btn btn-xs btn-ghost" aria-label="Previous file" (click)="store.prevFile()">
                        <ng-icon name="lucideChevronLeft" class="size-4" />
                    </button>
                    <span class="text-xs opacity-50 whitespace-nowrap">
                        {{ store.activeFileIndex() + 1 }} / {{ store.totalFiles() }}
                    </span>
                    <button class="btn btn-xs btn-ghost" aria-label="Next file" (click)="store.nextFile()">
                        <ng-icon name="lucideChevronRight" class="size-4" />
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-1 px-4 py-1 border-b border-base-300">
                <button
                    class="btn btn-xs"
                    [class.btn-active]="diffStyle() === 'unified'"
                    (click)="setDiffStyle('unified')"
                >
                    Unified
                </button>
                <button class="btn btn-xs" [class.btn-active]="diffStyle() === 'split'" (click)="setDiffStyle('split')">
                    Split
                </button>
                <div class="flex-1"></div>
                @if (store.isViewingLatest()) {
                    <button class="btn btn-xs btn-outline" title="Add a file-level comment" (click)="onFileComment()">
                        <ng-icon name="lucideMessageSquare" class="size-3" />
                        Comment on file
                    </button>
                }
            </div>

            @if (fileLevelForm(); as form) {
                <acr-inline-comment-form
                    [filePath]="form.filePath"
                    [lineStart]="form.lineStart"
                    [side]="form.side"
                    [snapshotId]="form.snapshotId"
                    [sessionId]="form.sessionId"
                    [isFileLevel]="true"
                    (saved)="onFileLevelFormSaved($event)"
                    (cancelled)="onFileLevelFormCancelled()"
                />
            }

            @for (thread of fileLevelComments(); track thread.comment.id) {
                <acr-inline-comment
                    class="mx-4 my-1"
                    [thread]="thread"
                    [sessionId]="store.currentSession()!.id"
                    (commentDeleted)="onFileLevelCommentDeleted($event)"
                    (commentResolved)="onFileLevelCommentResolved($event)"
                />
            }

            @if (activeMetadata(); as meta) {
                <acr-file-diff
                    [metadata]="meta"
                    [diffStyle]="diffStyle()"
                    [themeType]="resolvedTheme()"
                    [lineAnnotations]="annotations()"
                    [enableComments]="store.isViewingLatest()"
                    (lineNumberClicked)="onLineNumberClick($event)"
                    (lineRangeSelected)="onLineRangeSelected($event)"
                    (formSaved)="onFormSaved($event)"
                    (formCancelled)="onFormCancelled()"
                />
            }
        }
    `,
})
export class DiffViewer {
    protected readonly store = inject(SessionStore);
    readonly #prefs = inject(UiPreferences);
    readonly #themeSwitcher = inject(ThemeSwitcher);
    readonly #apiClient = inject(ApiClient);
    protected readonly diffStyle = this.#prefs.diffStyle;
    protected readonly resolvedTheme = this.#themeSwitcher.resolvedTheme;

    readonly #commentStore = inject(CommentStore);
    private readonly fileDiff = viewChild(AcrFileDiff);

    readonly #activeForm = signal<AnnotationMeta | null>(null);
    readonly #fileLevelForm = signal<Extract<AnnotationMeta, { type: 'form' }> | null>(null);
    #rangeJustSelected = false;
    protected readonly fileLevelForm = this.#fileLevelForm.asReadonly();

    protected readonly parsedFiles = computed<FileDiffMetadata[]>(() => {
        const diff = this.store.currentDiff();
        if (!diff?.raw_diff) return [];
        return parsePatchFiles(diff.raw_diff)[0]?.files ?? [];
    });

    readonly #baseMetadata = computed(() => this.parsedFiles()[this.store.activeFileIndex()] ?? null);

    readonly #fileContentResource = rxResource({
        params: () => {
            const meta = this.#baseMetadata();
            const snapshotId = this.store.activeSnapshotId();
            if (!meta || !snapshotId) return undefined;
            return { snapshotId, filePath: meta.name };
        },
        stream: ({ params }) => {
            if (!params) return of(null);
            return this.#apiClient.getFileContent(params.snapshotId, params.filePath);
        },
    });

    protected readonly activeMetadata = computed<FileDiffMetadata | null>(() => {
        const base = this.#baseMetadata();
        if (!base) return null;
        const content = this.#fileContentResource.value();
        if (!content?.oldContent && !content?.newContent) return base;
        const oldFile: FileContents = { name: base.prevName ?? base.name, contents: content.oldContent ?? '' };
        const newFile: FileContents = { name: base.name, contents: content.newContent ?? '' };
        return parseDiffFromFile(oldFile, newFile);
    });

    protected readonly fileLevelComments = computed(() => {
        const meta = this.activeMetadata();
        if (!meta) return [];
        const activeSnapId = this.store.activeSnapshotId();
        return this.#commentStore.comments().filter((t) => {
            const c = t.comment;
            return c.file_path === meta.name && c.line_start == null && c.snapshot_id === activeSnapId;
        });
    });

    protected readonly annotations = computed<DiffLineAnnotation<AnnotationMeta>[]>(() => {
        const meta = this.activeMetadata();
        if (!meta) return [];

        const fileName = meta.name;
        const comments = this.#commentStore.comments();
        const result: DiffLineAnnotation<AnnotationMeta>[] = [];

        // Build per-thread comment annotations (scoped to active snapshot, line-level only)
        const activeSnapId = this.store.activeSnapshotId();
        for (const thread of comments) {
            const c = thread.comment;
            if (c.file_path !== fileName || c.line_start == null) continue;
            if (c.snapshot_id !== activeSnapId) continue;
            result.push({
                side: (c.side ?? 'new') === 'old' ? 'deletions' : 'additions',
                lineNumber: c.line_end ?? c.line_start,
                metadata: { type: 'comment', thread },
            });
        }

        // Add active form annotation if present (exclude file-level forms)
        const form = this.#activeForm();
        if (form && form.type === 'form' && !form.isFileLevel) {
            result.push({
                side: form.side === 'old' ? 'deletions' : 'additions',
                lineNumber: form.lineEnd ?? form.lineStart,
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
            this.#fileLevelForm.set(null);
        });

        // Scroll to comment line when scroll target is set
        afterRenderEffect(() => {
            const target = this.store.scrollTarget();
            if (!target) return;
            const fileDiffInstance = this.fileDiff();
            if (!fileDiffInstance) return;

            const container = fileDiffInstance.diffContainer().nativeElement;

            // Find the line row element using @pierre/diffs data-line attribute
            const lineEl = container.querySelector(`[data-line="${target.lineStart}"]`) as HTMLElement | null;

            if (lineEl) {
                lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            this.store.clearScrollTarget();
        });
    }

    protected onLineNumberClick(event: { lineNumber: number; side: 'old' | 'new' }): void {
        if (!this.store.isViewingLatest()) return;
        // Skip if onLineRangeSelected already handled this interaction (multi-line drag)
        if (this.#rangeJustSelected) return;

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

    protected onLineRangeSelected(event: { lineStart: number; lineEnd: number; side: 'old' | 'new' }): void {
        if (!this.store.isViewingLatest()) return;
        const snapshotId = this.store.activeSnapshotId();
        const sessionId = this.store.currentSession()?.id;
        const meta = this.activeMetadata();
        if (!snapshotId || !sessionId || !meta) return;

        // Prevent the subsequent click→onLineNumberClick from overriding this range.
        // setTimeout (not queueMicrotask) because microtasks flush between pointerup and click events.
        this.#rangeJustSelected = true;
        setTimeout(() => {
            this.#rangeJustSelected = false;
        });

        this.#activeForm.set({
            type: 'form',
            filePath: meta.name,
            lineStart: event.lineStart,
            ...(event.lineStart !== event.lineEnd ? { lineEnd: event.lineEnd } : {}),
            side: event.side,
            snapshotId,
            sessionId,
        });
    }

    protected onFileComment(): void {
        if (!this.store.isViewingLatest()) return;
        const snapshotId = this.store.activeSnapshotId();
        const sessionId = this.store.currentSession()?.id;
        const meta = this.activeMetadata();
        if (!snapshotId || !sessionId || !meta) return;

        this.#fileLevelForm.set({
            type: 'form',
            filePath: meta.name,
            lineStart: 1,
            isFileLevel: true,
            side: 'new',
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

    protected onFileLevelFormSaved(comment: Comment): void {
        this.onFormSaved(comment);
        this.#fileLevelForm.set(null);
    }

    protected onFileLevelFormCancelled(): void {
        this.#fileLevelForm.set(null);
    }

    protected onFileLevelCommentDeleted(thread: CommentThread): void {
        this.#commentStore.deleteComment(thread.comment.id);
    }

    protected onFileLevelCommentResolved(thread: CommentThread): void {
        this.#commentStore.resolveComment(thread.comment.id);
    }

    protected setDiffStyle(style: 'unified' | 'split'): void {
        this.#prefs.setDiffStyle(style);
    }
}
