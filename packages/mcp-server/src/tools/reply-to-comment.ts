import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerReplyToComment(server: McpServer, client: ApiClient): void {
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
                const reply = await client.createReply(comment_id, content);

                const lines = [
                    'Reply created successfully.',
                    `  Reply ID: [${reply.id}]`,
                    `  Parent: [${comment_id}]`,
                    `  Status: ${reply.status}`,
                ];

                return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
            } catch (e) {
                console.error('[mcp-server] reply_to_comment error:', e);
                return { content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
            }
        },
    );
}
