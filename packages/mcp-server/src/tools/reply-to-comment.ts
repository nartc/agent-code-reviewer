import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import type { Database } from 'sql.js';
import { z } from 'zod';

interface CommentRow {
    id: string;
    session_id: string;
    snapshot_id: string;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    side: string | null;
}

type SqlParam = number | string | Uint8Array | null;

function queryRows<T>(db: Database, sql: string, params?: Record<string, SqlParam>): T[] {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
}

export function registerReplyToComment(server: McpServer, db: Database): void {
    server.registerTool(
        'reply_to_comment',
        {
            description: 'Create a threaded reply to a review comment as the agent',
            inputSchema: {
                comment_id: z.string().describe('The parent comment ID to reply to'),
                content: z.string().describe('The reply content'),
            },
        },
        async ({ comment_id, content }) => {
            try {
                const parents = queryRows<CommentRow>(
                    db,
                    'SELECT id, session_id, snapshot_id, file_path, line_start, line_end, side FROM comments WHERE id = $id',
                    { $id: comment_id },
                );

                if (parents.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Error: Comment "${comment_id}" not found. Cannot create reply.`,
                            },
                        ],
                    };
                }

                const parent = parents[0];
                const replyId = randomUUID();

                db.run(
                    `INSERT INTO comments (id, session_id, snapshot_id, reply_to_id, file_path, line_start, line_end, side, author, content, status, created_at)
                 VALUES ($id, $sessionId, $snapshotId, $replyToId, $filePath, $lineStart, $lineEnd, $side, 'agent', $content, 'draft', datetime('now'))`,
                    {
                        $id: replyId,
                        $sessionId: parent.session_id,
                        $snapshotId: parent.snapshot_id,
                        $replyToId: comment_id,
                        $filePath: parent.file_path,
                        $lineStart: parent.line_start,
                        $lineEnd: parent.line_end,
                        $side: parent.side,
                        $content: content,
                    },
                );

                const lines = [
                    'Reply created successfully.',
                    `  Reply ID: [${replyId}]`,
                    `  Parent: [${comment_id}]`,
                    '  Status: draft (use the review UI to send)',
                ];

                return {
                    content: [{ type: 'text' as const, text: lines.join('\n') }],
                };
            } catch (e) {
                console.error('[mcp-server] reply_to_comment error:', e);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
                };
            }
        },
    );
}
