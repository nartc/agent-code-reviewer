import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerMarkResolved(server: McpServer, client: ApiClient): void {
    server.registerTool(
        'mark_comment_resolved',
        {
            description: 'Mark a sent review comment as resolved',
            inputSchema: {
                comment_id: z.string().describe('The comment ID to resolve'),
            },
        },
        async ({ comment_id }) => {
            try {
                await client.resolveComment(comment_id);
                return { content: [{ type: 'text' as const, text: `Comment [${comment_id}] marked as resolved.` }] };
            } catch (e) {
                console.error('[mcp-server] mark_comment_resolved error:', e);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
                };
            }
        },
    );
}
