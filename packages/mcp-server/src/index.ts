import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api-client.js';
import { registerCheckComments } from './tools/check-comments.js';
import { registerGetDetails } from './tools/get-details.js';
import { registerMarkResolved } from './tools/mark-resolved.js';
import { registerReplyToComment } from './tools/reply-to-comment.js';

async function main(): Promise<void> {
    const serverUrl = process.env['SERVER_URL'] ?? 'http://localhost:3847';
    console.error(`[mcp-server] Connecting to server: ${serverUrl}`);

    const client = new ApiClient(serverUrl);

    const server = new McpServer({
        name: 'agent-code-reviewer',
        version: '1.0.0',
    });

    registerCheckComments(server, client);
    registerGetDetails(server, client);
    registerReplyToComment(server, client);
    registerMarkResolved(server, client);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[mcp-server] Connected via stdio');
}

main().catch((e) => {
    console.error('[mcp-server] Fatal error:', e);
    process.exit(1);
});
