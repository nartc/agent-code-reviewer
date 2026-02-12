import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import { z } from 'zod';

interface CommentRow {
    id: string;
    status: string;
    resolved_at: string | null;
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

export function registerMarkResolved(server: McpServer, db: Database): void {
    server.registerTool('mark_comment_resolved', {
        description: 'Mark a sent review comment as resolved',
        inputSchema: {
            comment_id: z.string().describe('The comment ID to resolve'),
        },
    }, async ({ comment_id }) => {
        try {
            const comments = queryRows<CommentRow>(
                db,
                'SELECT id, status, resolved_at FROM comments WHERE id = $id',
                { $id: comment_id },
            );

            if (comments.length === 0) {
                return {
                    content: [{ type: 'text' as const, text: `Error: Comment "${comment_id}" not found.` }],
                };
            }

            const comment = comments[0];

            if (comment.status !== 'sent') {
                return {
                    content: [{ type: 'text' as const, text: `Error: Comment "${comment_id}" must be in 'sent' status to resolve. Current status: ${comment.status}.` }],
                };
            }

            if (comment.resolved_at != null) {
                return {
                    content: [{ type: 'text' as const, text: `Error: Comment "${comment_id}" is already resolved.` }],
                };
            }

            db.run(
                "UPDATE comments SET status = 'resolved', resolved_at = datetime('now') WHERE id = $id",
                { $id: comment_id },
            );

            return {
                content: [{ type: 'text' as const, text: `Comment [${comment_id}] marked as resolved.` }],
            };
        } catch (e) {
            console.error('[mcp-server] mark_comment_resolved error:', e);
            return {
                content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
            };
        }
    });
}
