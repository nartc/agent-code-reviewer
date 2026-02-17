import type { FileDiffMetadata, OnDiffLineClickProps } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    afterRenderEffect,
    inject,
    input,
    output,
    viewChild,
} from '@angular/core';

@Component({
    selector: 'acr-file-diff',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col flex-1 overflow-hidden' },
    template: `<div #diffContainer class="flex-1 overflow-auto"></div>`,
})
export class AcrFileDiff {
    readonly metadata = input.required<FileDiffMetadata>();
    readonly diffStyle = input<'unified' | 'split'>('unified');
    readonly lineClicked = output<OnDiffLineClickProps>();

    readonly diffContainer = viewChild.required<ElementRef<HTMLDivElement>>('diffContainer');

    #instance: FileDiff | null = null;
    readonly #destroyRef = inject(DestroyRef);

    constructor() {
        afterRenderEffect(() => {
            const meta = this.metadata();
            const style = this.diffStyle();
            const container = this.diffContainer().nativeElement;

            this.#instance?.cleanUp();

            this.#instance = new FileDiff({
                diffStyle: style,
                diffIndicators: 'bars',
                lineDiffType: 'word',
                overflow: 'scroll',
                onLineClick: (props) => this.lineClicked.emit(props),
                onLineNumberClick: (props) => this.lineClicked.emit(props),
                renderAnnotation: () => {
                    const el = document.createElement('div');
                    el.className = 'annotation-anchor';
                    return el;
                },
            });

            this.#instance.render({ fileDiff: meta, fileContainer: container });
        });

        this.#destroyRef.onDestroy(() => {
            this.#instance?.cleanUp();
            this.#instance = null;
        });
    }
}
