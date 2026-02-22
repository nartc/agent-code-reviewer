import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerGetDetails(server: McpServer, client: ApiClient): void {
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
                const { thread } = await client.getCommentThread(comment_id);
                const { comment, replies } = thread;
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

                return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
            } catch (e) {
                console.error('[mcp-server] get_comment_details error:', e);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
                };
            }
        },
    );
}
