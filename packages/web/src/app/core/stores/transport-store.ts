import { Injectable, inject } from '@angular/core';
import { signalState, patchState } from '@ngrx/signals';
import { forkJoin } from 'rxjs';
import type { Target, TransportType, TransportStatus } from '@agent-code-reviewer/shared';
import { ApiClient } from '../services/api-client';

@Injectable({ providedIn: 'root' })
export class TransportStore {
    readonly #api = inject(ApiClient);

    readonly #state = signalState({
        targets: [] as Target[],
        activeTransport: null as TransportType | null,
        lastTargetId: null as string | null,
        statuses: [] as TransportStatus[],
    });

    readonly targets = this.#state.targets;
    readonly activeTransport = this.#state.activeTransport;
    readonly lastTargetId = this.#state.lastTargetId;
    readonly statuses = this.#state.statuses;

    loadTargets(): void {
        this.#api.listTargets().subscribe({
            next: ({ targets }) => {
                patchState(this.#state, { targets });
            },
        });
    }

    loadStatus(): void {
        this.#api.getTransportStatus().subscribe({
            next: ({ statuses }) => {
                patchState(this.#state, { statuses });
            },
        });
    }

    loadConfig(): void {
        this.#api.getTransportConfig().subscribe({
            next: ({ active_transport, last_target_id }) => {
                patchState(this.#state, { activeTransport: active_transport, lastTargetId: last_target_id });
            },
        });
    }

    setActiveTransport(type: TransportType, targetId?: string): void {
        this.#api.updateTransportConfig({ active_transport: type, last_target_id: targetId }).subscribe({
            next: () => {
                patchState(this.#state, { activeTransport: type, lastTargetId: targetId ?? null });
            },
        });
    }

    refreshTargets(): void {
        forkJoin([this.#api.listTargets(), this.#api.getTransportStatus()]).subscribe({
            next: ([{ targets }, { statuses }]) => {
                patchState(this.#state, { targets, statuses });
            },
        });
    }
}
