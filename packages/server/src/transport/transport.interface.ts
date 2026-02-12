import type {
    CommentPayload,
    Target,
    TransportError,
    TransportStatus,
    TransportType,
    TransportUnavailableError,
} from '@agent-code-reviewer/shared';
import type { ResultAsync } from 'neverthrow';

export interface SendResult {
    success: boolean;
    formatted_text?: string;
}

export interface Transport {
    readonly type: TransportType;
    isAvailable(): ResultAsync<boolean, never>;
    listTargets(): ResultAsync<Target[], TransportError>;
    sendComments(
        targetId: string,
        payloads: CommentPayload[],
    ): ResultAsync<SendResult, TransportError | TransportUnavailableError>;
    getStatus(): ResultAsync<TransportStatus, never>;
}
