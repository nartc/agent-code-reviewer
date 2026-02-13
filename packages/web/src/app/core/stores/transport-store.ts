import { Injectable, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import type { ListTargetsResponse, TransportConfigResponse, TransportStatusResponse, TransportType } from '@agent-code-reviewer/shared';
import { ApiClient } from '../services/api-client';

@Injectable({ providedIn: 'root' })
export class TransportStore {
    readonly #api = inject(ApiClient);

    readonly #targetsResource = httpResource<ListTargetsResponse>(() => '/api/transport/targets');
    readonly #statusResource = httpResource<TransportStatusResponse>(() => '/api/transport/status');
    readonly #configResource = httpResource<TransportConfigResponse>(() => '/api/transport/config');

    readonly targets = computed(() => this.#targetsResource.value()?.targets ?? []);
    readonly statuses = computed(() => this.#statusResource.value()?.statuses ?? []);
    readonly activeTransport = computed(() => this.#configResource.value()?.active_transport ?? null);
    readonly lastTargetId = computed(() => this.#configResource.value()?.last_target_id ?? null);
    readonly isLoading = computed(
        () => this.#targetsResource.isLoading() || this.#statusResource.isLoading() || this.#configResource.isLoading(),
    );

    setActiveTransport(type: TransportType, targetId?: string): void {
        this.#api.updateTransportConfig({ active_transport: type, last_target_id: targetId }).subscribe({
            next: () => {
                this.#configResource.reload();
            },
        });
    }

    refreshTargets(): void {
        this.#targetsResource.reload();
        this.#statusResource.reload();
    }
}
