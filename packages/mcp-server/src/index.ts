import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initMcpDatabase } from './db.js';
import { registerCheckComments } from './tools/check-comments.js';
import { registerGetDetails } from './tools/get-details.js';
import { registerMarkResolved } from './tools/mark-resolved.js';
import { registerReplyToComment } from './tools/reply-to-comment.js';

async function main(): Promise<void> {
    const dbPath = process.env['DB_PATH'] ?? join(homedir(), '.config', 'agent-code-reviewer', 'db', 'reviewer.db');

    console.error(`[mcp-server] Opening database: ${dbPath}`);

    const dbResult = await initMcpDatabase(dbPath);
    if (dbResult.isErr()) {
        console.error(`[mcp-server] Failed to open database: ${dbResult.error.message}`);
        process.exit(1);
    }

    const db = dbResult.value;

    const server = new McpServer({
        name: 'agent-code-reviewer',
        version: '1.0.0',
    });

    registerCheckComments(server, db);
    registerGetDetails(server, db);
    registerReplyToComment(server, db);
    registerMarkResolved(server, db);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[mcp-server] Connected via stdio');
}

main().catch((e) => {
    console.error('[mcp-server] Fatal error:', e);
    process.exit(1);
});
