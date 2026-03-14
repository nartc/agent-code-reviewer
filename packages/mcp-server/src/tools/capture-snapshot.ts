import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerCaptureSnapshot(server: McpServer, client: ApiClient): void {
    server.registerTool(
        'capture_snapshot',
        {
            description:
                'Capture a new snapshot after committing. Resolve addressed comments first, then commit, then call this.',
            inputSchema: {
                repo_path: z.string().optional().describe('Absolute path to the repository'),
                repo_name: z.string().optional().describe('Repository name'),
            },
        },
        async ({ repo_path, repo_name }) => {
            try {
                if (!repo_path && !repo_name) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: 'Error: At least one of repo_path or repo_name is required',
                            },
                        ],
                    };
                }

                const { snapshot } = await client.captureSnapshot({ repo_path, repo_name });

                const lines = [
                    'Snapshot captured successfully.',
                    `  ID: ${snapshot.id}`,
                    `  HEAD: ${snapshot.head_commit ?? 'unknown'}`,
                    `  Files: ${snapshot.files_count}`,
                    `  Trigger: ${snapshot.trigger}`,
                ];

                return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
            } catch (e) {
                console.error('[mcp-server] capture_snapshot error:', e);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
                };
            }
        },
    );
}
