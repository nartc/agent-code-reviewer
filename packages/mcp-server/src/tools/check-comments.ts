import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerCheckComments(server: McpServer, client: ApiClient): void {
    server.registerTool(
        'check_comments',
        {
            description: 'Find new (sent, unresolved) review comments for a repository',
            inputSchema: {
                repo_path: z.string().optional().describe('Absolute path to the repository'),
                repo_name: z.string().optional().describe('Repository name'),
                snapshot_id: z.string().optional().describe('Snapshot ID to scope comments to a specific review snapshot'),
            },
        },
        async ({ repo_path, repo_name, snapshot_id }) => {
            try {
                if (!repo_path && !repo_name) {
                    return {
                        content: [{ type: 'text' as const, text: 'Error: At least one of repo_path or repo_name is required' }],
                    };
                }

                const { threads, repo_name: repoName } = await client.getUnresolvedComments({ repo_path, repo_name, snapshot_id });

                if (threads.length === 0) {
                    return {
                        content: [{ type: 'text' as const, text: `No unresolved comments found for repo "${repoName}".` }],
                    };
                }

                const lines: string[] = [
                    `Found ${threads.length} unresolved comment${threads.length !== 1 ? 's' : ''} for repo "${repoName}":\n`,
                ];

                for (let i = 0; i < threads.length; i++) {
                    const { comment: c, replies } = threads[i];
                    let lineRef = c.file_path;
                    if (c.line_start != null) {
                        lineRef += c.line_end != null && c.line_end !== c.line_start
                            ? ` L${c.line_start}-${c.line_end}`
                            : ` L${c.line_start}`;
                    }
                    if (c.side) {
                        lineRef += ` (${c.side})`;
                    }

                    lines.push(`${i + 1}. [${c.id}] ${lineRef}`);
                    lines.push(`   "${c.content}"`);

                    for (const reply of replies) {
                        lines.push(`   ↳ [${reply.author}] "${reply.content}" (${reply.status})`);
                    }

                    lines.push('');
                }

                lines.push('Use get_comment_details for full info, reply_to_comment to respond, or mark_comment_resolved to resolve.');

                return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
            } catch (e) {
                console.error('[mcp-server] check_comments error:', e);
                return { content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
            }
        },
    );
}
