import { formatCommentsForTransport, type CommentPayload, type TransportType } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { CommentStore } from '../../../core/stores/comment-store';
import { TransportStore } from '../../../core/stores/transport-store';

const TRANSPORT_TYPES: TransportType[] = ['tmux', 'mcp', 'clipboard'];

@Component({
    selector: 'acr-transport-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col gap-1.5 p-2 border-b border-base-300' },
    template: `
            <div class="flex items-center gap-1.5">
                <label class="text-xs font-semibold shrink-0">Transport</label>

                <select
                    class="select select-xs select-bordered flex-1"
                    [value]="selectedType()"
                    (change)="onTypeChange($any($event.target).value)"
                >
                    @for (type of transportTypes; track type) {
                        <option [value]="type" [disabled]="!isAvailable(type)">
                            {{ type }}{{ isAvailable(type) ? '' : ' (unavailable)' }}
                        </option>
                    }
                </select>

                <button class="btn btn-xs btn-ghost" (click)="transportStore.refreshTargets()" title="Refresh">
                    &#8635;
                </button>
            </div>

            @if (filteredTargets().length > 0) {
                <div class="flex flex-col gap-1 max-h-32 overflow-auto">
                    @for (target of filteredTargets(); track target.id) {
                        <button
                            class="btn btn-xs justify-start truncate"
                            [class.btn-primary]="target.id === selectedTargetId()"
                            [class.btn-ghost]="target.id !== selectedTargetId()"
                            [title]="target.label"
                            (click)="onTargetSelect(target.id)"
                        >
                            {{ target.label }}
                        </button>
                    }
                </div>
            } @else if (selectedType() === 'tmux') {
                <div class="text-xs p-2 bg-base-200 rounded">
                    <p class="font-semibold">No agent harnesses detected</p>
                    <p class="opacity-70 mt-1">Start Claude Code or OpenCode in a tmux pane at this repo's directory</p>
                </div>
            } @else {
                <div class="text-xs opacity-50 p-1">No targets available</div>
            }

            <div class="flex items-center gap-2">
                <button
                    class="btn btn-xs btn-ghost gap-1"
                    [class.btn-active]="showPreview()"
                    (click)="showPreview.set(!showPreview())"
                >
                    Preview
                </button>
            </div>

            @if (showPreview()) {
                <pre class="text-xs whitespace-pre-wrap max-h-48 overflow-auto bg-base-200 rounded p-2 border border-base-300">{{ previewText() || 'No draft comments' }}</pre>
            }
    `,
})
export class TransportPicker {
    protected readonly transportStore = inject(TransportStore);
    private readonly commentStore = inject(CommentStore);

    protected readonly transportTypes = TRANSPORT_TYPES;

    protected readonly selectedType = linkedSignal<TransportType | null, TransportType | null>({
        source: () => this.transportStore.activeTransport(),
        computation: (source) => source,
    });

    protected readonly selectedTargetId = linkedSignal<string | null, string | null>({
        source: () => this.transportStore.lastTargetId(),
        computation: (source) => source,
    });

    protected readonly filteredTargets = computed(() => {
        const type = this.selectedType();
        if (!type) return [];
        return this.transportStore.targets().filter((t) => t.transport === type);
    });

    protected readonly showPreview = signal(false);

    protected readonly previewText = computed(() => {
        const drafts = this.commentStore.draftComments();
        if (drafts.length === 0) return '';
        const payloads: CommentPayload[] = drafts.map((t) => ({
            file_path: t.comment.file_path,
            line_start: t.comment.line_start,
            line_end: t.comment.line_end,
            side: t.comment.side,
            content: t.comment.content,
            status: t.comment.status,
            author: t.comment.author,
            thread_replies: t.replies.map((r) => ({ content: r.content, author: r.author })),
        }));
        return formatCommentsForTransport(payloads);
    });

    private readonly statusMap = computed(() => {
        const record: Record<string, boolean> = {};
        for (const s of this.transportStore.statuses()) {
            record[s.type] = s.available;
        }
        record['clipboard'] = true;
        return record;
    });

    protected isAvailable(type: TransportType): boolean {
        if (type === 'clipboard') return true;
        return this.statusMap()[type] ?? false;
    }

    protected onTypeChange(type: TransportType): void {
        this.selectedType.set(type);
        const targets = this.transportStore.targets().filter((t) => t.transport === type);
        const firstTarget = targets[0];
        this.selectedTargetId.set(firstTarget?.id ?? null);
        this.transportStore.setActiveTransport(type, firstTarget?.id);
    }

    protected onTargetSelect(targetId: string): void {
        this.selectedTargetId.set(targetId);
        const type = this.selectedType();
        if (type) {
            this.transportStore.setActiveTransport(type, targetId);
        }
    }
}
