import type { SnapshotSummary } from '@agent-code-reviewer/shared';
import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

interface DotPosition {
    id: string;
    left: number;
    hasReviewComments: boolean;
    isActive: boolean;
}

@Component({
    selector: 'acr-snapshot-timeline',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SlicePipe, NgIcon],
    template: `
        <div class="relative flex items-center h-10 px-2 border-b border-base-300 gap-1">
            <button class="btn btn-xs btn-ghost" [disabled]="!canGoPrev()" (click)="goPrev()">
                <ng-icon name="lucideChevronLeft" class="size-4" />
            </button>

            <div class="relative flex-1 h-2 bg-base-200 rounded-full mx-1">
                @for (dot of dotPositions(); track dot.id) {
                    <button
                        class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-all"
                        [class]="
                            dot.isActive
                                ? 'w-4 h-4 bg-primary'
                                : dot.hasReviewComments
                                  ? 'w-3 h-3 bg-warning ring-2 ring-warning/30'
                                  : 'w-2 h-2 bg-base-content/40 hover:bg-base-content/70'
                        "
                        [style.left.%]="dot.left"
                        [attr.title]="dot.id | slice: 0 : 8"
                        (click)="snapshotSelected.emit(dot.id)"
                    ></button>
                }
            </div>

            <button class="btn btn-xs btn-ghost" [disabled]="!canGoNext()" (click)="goNext()">
                <ng-icon name="lucideChevronRight" class="size-4" />
            </button>

            @if (!isViewingLatest()) {
                <button class="btn btn-xs btn-accent gap-1" (click)="jumpToLatest.emit()">
                    @if (hasNewChanges()) {
                        <span class="badge badge-xs badge-error"></span>
                    }
                    Latest
                </button>
            }
        </div>
    `,
})
export class SnapshotTimeline {
    readonly snapshots = input.required<SnapshotSummary[]>();
    readonly activeSnapshotId = input.required<string | null>();
    readonly hasNewChanges = input(false);

    readonly snapshotSelected = output<string>();
    readonly jumpToLatest = output<void>();

    protected readonly dotPositions = computed<DotPosition[]>(() => {
        const snaps = this.snapshots();
        const activeId = this.activeSnapshotId();
        if (snaps.length === 0) return [];
        if (snaps.length === 1) {
            return [{ id: snaps[0].id, left: 50, hasReviewComments: snaps[0].has_review_comments, isActive: snaps[0].id === activeId }];
        }

        const timestamps = snaps.map((s) => new Date(s.created_at).getTime());
        const min = Math.min(...timestamps);
        const max = Math.max(...timestamps);
        const range = max - min || 1;

        return snaps.map((s, i) => ({
            id: s.id,
            left: ((timestamps[i] - min) / range) * 100,
            hasReviewComments: s.has_review_comments,
            isActive: s.id === activeId,
        }));
    });

    protected readonly canGoPrev = computed(() => {
        const snaps = this.snapshots();
        const activeId = this.activeSnapshotId();
        if (snaps.length <= 1 || !activeId) return false;
        return snaps[snaps.length - 1].id !== activeId;
    });

    protected readonly canGoNext = computed(() => {
        const snaps = this.snapshots();
        const activeId = this.activeSnapshotId();
        if (snaps.length <= 1 || !activeId) return false;
        return snaps[0].id !== activeId;
    });

    protected readonly isViewingLatest = computed(() => {
        const snaps = this.snapshots();
        return snaps.length > 0 && snaps[0].id === this.activeSnapshotId();
    });

    protected goPrev(): void {
        const snaps = this.snapshots();
        const activeId = this.activeSnapshotId();
        const idx = snaps.findIndex((s) => s.id === activeId);
        if (idx >= 0 && idx < snaps.length - 1) {
            this.snapshotSelected.emit(snaps[idx + 1].id);
        }
    }

    protected goNext(): void {
        const snaps = this.snapshots();
        const activeId = this.activeSnapshotId();
        const idx = snaps.findIndex((s) => s.id === activeId);
        if (idx > 0) {
            this.snapshotSelected.emit(snaps[idx - 1].id);
        }
    }
}
