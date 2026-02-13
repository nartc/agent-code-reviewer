import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import { z } from 'zod';

interface CommentRow {
    id: string;
    session_id: string;
    snapshot_id: string;
    reply_to_id: string | null;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    side: string | null;
    author: string;
    content: string;
    status: string;
    created_at: string;
    sent_at: string | null;
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

export function registerGetDetails(server: McpServer, db: Database): void {
    server.registerTool(
        'get_comment_details',
        {
            description: 'Get full details of a specific review comment including all replies',
            inputSchema: {
                comment_id: z.string().describe('The comment ID to look up'),
            },
        },
        async ({ comment_id }) => {
            try {
                const comments = queryRows<CommentRow>(db, 'SELECT * FROM comments WHERE id = $id', {
                    $id: comment_id,
                });

                if (comments.length === 0) {
                    return {
                        content: [{ type: 'text' as const, text: `Error: Comment "${comment_id}" not found.` }],
                    };
                }

                const comment = comments[0];
                const lines: string[] = [];

                lines.push(`Comment [${comment.id}]:`);
                lines.push(`  File: ${comment.file_path}`);

                if (comment.line_start != null) {
                    let lineRef = `${comment.line_start}`;
                    if (comment.line_end != null && comment.line_end !== comment.line_start) {
                        lineRef += `-${comment.line_end}`;
                    }
                    if (comment.side) {
                        lineRef += ` (${comment.side} side)`;
                    }
                    lines.push(`  Lines: ${lineRef}`);
                }

                lines.push(`  Author: ${comment.author}`);
                lines.push(`  Status: ${comment.status}`);
                lines.push(`  Content: "${comment.content}"`);
                lines.push(`  Created: ${comment.created_at}`);

                if (comment.sent_at) {
                    lines.push(`  Sent: ${comment.sent_at}`);
                }
                if (comment.resolved_at) {
                    lines.push(`  Resolved: ${comment.resolved_at}`);
                }

                const replies = queryRows<CommentRow>(
                    db,
                    'SELECT * FROM comments WHERE reply_to_id = $parentId ORDER BY created_at',
                    { $parentId: comment.id },
                );

                if (replies.length > 0) {
                    lines.push('');
                    lines.push(`Replies (${replies.length}):`);
                    for (let i = 0; i < replies.length; i++) {
                        const reply = replies[i];
                        lines.push(
                            `  ${i + 1}. [${reply.id}] ${reply.author} (${reply.status}): "${reply.content}" — ${reply.created_at}`,
                        );
                    }
                }

                return {
                    content: [{ type: 'text' as const, text: lines.join('\n') }],
                };
            } catch (e) {
                console.error('[mcp-server] get_comment_details error:', e);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
                };
            }
        },
    );
}
