import type { Comment } from '@agent-code-reviewer/shared';
import type { DiffLineAnnotation, FileDiffMetadata, OnDiffLineClickProps } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs';
import { DomPortalOutlet, ComponentPortal } from '@angular/cdk/portal';
import {
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    DestroyRef,
    ElementRef,
    Injector,
    afterRenderEffect,
    inject,
    input,
    output,
    viewChild,
} from '@angular/core';
import type { AnnotationMeta } from './annotation-meta';
import { CommentIndicator } from './comment-indicator';
import { InlineCommentForm } from './inline-comment-form';

@Component({
    selector: 'acr-file-diff',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col flex-1 overflow-hidden' },
    template: `<div #diffContainer class="flex-1 overflow-auto"></div>`,
})
export class AcrFileDiff {
    readonly metadata = input.required<FileDiffMetadata>();
    readonly diffStyle = input<'unified' | 'split'>('unified');
    readonly lineAnnotations = input<DiffLineAnnotation<AnnotationMeta>[]>([]);
    readonly lineClicked = output<OnDiffLineClickProps>();
    readonly lineNumberClicked = output<{ lineNumber: number; side: 'old' | 'new' }>();
    readonly indicatorClicked = output<string[]>();
    readonly formSaved = output<Comment>();
    readonly formCancelled = output<void>();

    readonly diffContainer = viewChild.required<ElementRef<HTMLDivElement>>('diffContainer');

    #instance: FileDiff<AnnotationMeta> | null = null;
    readonly #activeOutlets: DomPortalOutlet[] = [];
    readonly #destroyRef = inject(DestroyRef);
    readonly #appRef = inject(ApplicationRef);
    readonly #injector = inject(Injector);

    constructor() {
        afterRenderEffect(() => {
            const meta = this.metadata();
            const style = this.diffStyle();
            const annotations = this.lineAnnotations();
            const container = this.diffContainer().nativeElement;

            this.#disposeOutlets();
            this.#instance?.cleanUp();

            this.#instance = new FileDiff<AnnotationMeta>({
                diffStyle: style,
                diffIndicators: 'bars',
                lineDiffType: 'word',
                overflow: 'scroll',
                onLineClick: (props) => this.lineClicked.emit(props),
                onLineNumberClick: (props) => {
                    this.lineClicked.emit(props);
                    this.lineNumberClicked.emit({
                        lineNumber: props.lineNumber,
                        side: props.annotationSide === 'deletions' ? 'old' : 'new',
                    });
                },
                renderAnnotation: (annotation) => this.#renderAnnotation(annotation),
            });

            this.#instance.render({ fileDiff: meta, fileContainer: container, lineAnnotations: annotations });
        });

        this.#destroyRef.onDestroy(() => {
            this.#disposeOutlets();
            this.#instance?.cleanUp();
            this.#instance = null;
        });
    }

    updateAnnotations(annotations: DiffLineAnnotation<AnnotationMeta>[]): void {
        this.#disposeOutlets();
        this.#instance?.setLineAnnotations(annotations);
    }

    #renderAnnotation(annotation: DiffLineAnnotation<AnnotationMeta>): HTMLElement | undefined {
        if (!annotation.metadata) return undefined;

        const el = document.createElement('div');
        el.className = 'annotation-anchor';
        const outlet = new DomPortalOutlet(el, this.#appRef, this.#injector);

        if (annotation.metadata.type === 'indicator') {
            const portal = new ComponentPortal(CommentIndicator);
            const ref: ComponentRef<CommentIndicator> = outlet.attach(portal);
            ref.setInput('count', annotation.metadata.count);
            ref.setInput('commentIds', annotation.metadata.commentIds);
            ref.instance.clicked.subscribe((ids) => this.indicatorClicked.emit(ids));
        } else if (annotation.metadata.type === 'form') {
            const portal = new ComponentPortal(InlineCommentForm);
            const ref: ComponentRef<InlineCommentForm> = outlet.attach(portal);
            ref.setInput('filePath', annotation.metadata.filePath);
            ref.setInput('lineStart', annotation.metadata.lineStart);
            ref.setInput('side', annotation.metadata.side);
            ref.setInput('snapshotId', annotation.metadata.snapshotId);
            ref.setInput('sessionId', annotation.metadata.sessionId);
            ref.instance.saved.subscribe((comment) => {
                this.formSaved.emit(comment);
            });
            ref.instance.cancelled.subscribe(() => {
                this.formCancelled.emit();
            });
        }

        this.#activeOutlets.push(outlet);
        return el;
    }

    #disposeOutlets(): void {
        for (const outlet of this.#activeOutlets) {
            outlet.dispose();
        }
        this.#activeOutlets.length = 0;
    }
}
