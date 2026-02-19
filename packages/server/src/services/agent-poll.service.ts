import type { DbService } from './db.service.js';
import type { SseService } from './sse.service.js';

interface AgentCommentRow {
    id: string;
    session_id: string;
    created_at: string;
}

/**
 * Polls SQLite for new agent-authored comments written by the MCP server.
 *
 * Resolve flow:
 *  1. Primary: agent calls `mark_resolved` MCP tool → writes to SQLite → this poller detects it → SSE → UI refreshes
 *  2. Fallback: user clicks "Resolve" on sent comments in the UI (CommentCard / CommentListItem)
 *  3. Bulk fallback: user clicks "Resolve all" on the Comments History page (F7)
 */
export class AgentPollService {
    #intervalId: ReturnType<typeof setInterval> | null = null;
    #lastPollTimestamp: string;

    constructor(
        private db: DbService,
        private sse: SseService,
        private intervalMs: number = 5000,
    ) {
        this.#lastPollTimestamp = new Date().toISOString();
    }

    start(): void {
        if (this.#intervalId) return;
        console.log(`[agent-poll] Starting poll every ${this.intervalMs}ms`);
        this.#intervalId = setInterval(() => this.#poll(), this.intervalMs);
    }

    stop(): void {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
            console.log('[agent-poll] Stopped');
        }
    }

    #poll(): void {
        const result = this.db.query<AgentCommentRow>(
            `SELECT id, session_id, created_at FROM comments
             WHERE author = 'agent' AND reply_to_id IS NULL AND created_at > $since
             ORDER BY created_at`,
            { $since: this.#lastPollTimestamp },
        );

        if (result.isErr()) {
            console.error('[agent-poll] Query failed:', result.error);
            return;
        }

        const rows = result.value;
        if (rows.length === 0) return;

        // Update timestamp to the latest found comment
        this.#lastPollTimestamp = rows[rows.length - 1].created_at;

        // Broadcast per unique session
        const sessionIds = new Set(rows.map((r) => r.session_id));
        for (const sessionId of sessionIds) {
            this.sse.broadcast(sessionId, {
                type: 'comment-update',
                data: { session_id: sessionId, comment_id: 'agent-poll', action: 'created' },
            });
        }

        console.log(`[agent-poll] Found ${rows.length} new agent comments across ${sessionIds.size} sessions`);
    }
}
