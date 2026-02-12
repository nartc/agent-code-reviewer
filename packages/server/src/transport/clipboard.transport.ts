import {
    type CommentPayload,
    type Target,
    type TransportError,
    type TransportStatus,
    type TransportUnavailableError,
    formatCommentsForTransport,
} from '@agent-code-reviewer/shared';
import { type ResultAsync, okAsync } from 'neverthrow';
import type { SendResult, Transport } from './transport.interface.js';

export class ClipboardTransport implements Transport {
    readonly type = 'clipboard' as const;

    isAvailable(): ResultAsync<boolean, never> {
        return okAsync(true);
    }

    listTargets(): ResultAsync<Target[], TransportError> {
        return okAsync([
            { id: 'clipboard', label: 'Copy to Clipboard', transport: 'clipboard' as const },
        ]);
    }

    sendComments(
        _targetId: string,
        payloads: CommentPayload[],
    ): ResultAsync<SendResult, TransportError | TransportUnavailableError> {
        const formatted = formatCommentsForTransport(payloads);
        return okAsync({ success: true, formatted_text: formatted });
    }

    getStatus(): ResultAsync<TransportStatus, never> {
        return okAsync({ type: 'clipboard' as const, available: true });
    }
}
