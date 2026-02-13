import {
    type CommentPayload,
    type DatabaseError,
    type Target,
    type TransportConfigResponse,
    type TransportError,
    type TransportStatus,
    type TransportType,
    type TransportUnavailableError,
    transportUnavailable,
} from '@agent-code-reviewer/shared';
import { type Result, ResultAsync, err, errAsync, ok } from 'neverthrow';
import type { SendResult, Transport } from '../transport/transport.interface.js';
import type { DbService } from './db.service.js';

interface TransportConfigRow {
    id: string;
    active_transport: string;
    last_target_id: string | null;
    settings: string | null;
    updated_at: string;
}

export class TransportService {
    constructor(
        private transports: Transport[],
        private db: DbService,
    ) {}

    listAllTargets(): ResultAsync<Target[], TransportError> {
        const promises = this.transports.map((t) =>
            t.listTargets().match(
                (targets) => targets,
                (error) => {
                    console.error(`[transport] ${t.type} listTargets failed:`, error.message);
                    return [] as Target[];
                },
            ),
        );

        return ResultAsync.fromSafePromise(Promise.all(promises)).map((arrays) => arrays.flat());
    }

    send(
        type: TransportType,
        targetId: string,
        payloads: CommentPayload[],
    ): ResultAsync<SendResult, TransportError | TransportUnavailableError> {
        const transport = this.transports.find((t) => t.type === type);
        if (!transport) {
            return errAsync(transportUnavailable(type));
        }
        return transport.sendComments(targetId, payloads);
    }

    getActiveConfig(): Result<TransportConfigResponse, DatabaseError> {
        const result = this.db.queryOne<TransportConfigRow>("SELECT * FROM transport_config WHERE id = 'default'");
        if (result.isErr()) return err(result.error);

        if (!result.value) {
            return ok({
                active_transport: 'tmux' as TransportType,
                last_target_id: null,
                settings: null,
            });
        }

        const row = result.value;
        return ok({
            active_transport: row.active_transport as TransportType,
            last_target_id: row.last_target_id,
            settings: row.settings ? JSON.parse(row.settings) : null,
        });
    }

    saveActiveConfig(type: TransportType, lastTargetId?: string): Result<void, DatabaseError> {
        return this.db
            .execute(
                `INSERT OR REPLACE INTO transport_config (id, active_transport, last_target_id, updated_at)
             VALUES ('default', $type, $lastTargetId, datetime('now'))`,
                {
                    $type: type,
                    $lastTargetId: lastTargetId ?? null,
                },
            )
            .map(() => undefined);
    }

    getAllStatus(): ResultAsync<TransportStatus[], never> {
        const promises = this.transports.map((t) => t.getStatus());
        return ResultAsync.combine(promises);
    }
}
