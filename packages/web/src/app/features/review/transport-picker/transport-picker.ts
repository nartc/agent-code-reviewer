import type { TransportType } from '@agent-code-reviewer/shared';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { TransportStore } from '../../../core/stores/transport-store';

const TRANSPORT_TYPES: TransportType[] = ['tmux', 'mcp', 'clipboard'];

@Component({
    selector: 'acr-transport-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="flex flex-col gap-2 p-2 border-b border-base-300">
            <div class="flex items-center gap-2">
                <label class="text-xs font-semibold">Transport</label>

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
                            class="btn btn-xs justify-start"
                            [class.btn-primary]="target.id === selectedTargetId()"
                            [class.btn-ghost]="target.id !== selectedTargetId()"
                            (click)="onTargetSelect(target.id)"
                        >
                            {{ target.label }}
                        </button>
                    }
                </div>
            } @else {
                <div class="text-xs opacity-50 p-1">No targets available</div>
            }
        </div>
    `,
})
export class TransportPicker {
    protected readonly transportStore = inject(TransportStore);

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

    private readonly statusMap = computed(() => {
        const map = new Map<string, boolean>();
        for (const s of this.transportStore.statuses()) {
            map.set(s.type, s.available);
        }
        map.set('clipboard', true);
        return map;
    });

    protected isAvailable(type: TransportType): boolean {
        if (type === 'clipboard') return true;
        return this.statusMap().get(type) ?? false;
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
