import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiClient } from '../api-client.js';

export function registerImportPrComments(server: McpServer, client: ApiClient): void {
    server.registerTool(
        'import_pr_comments',
        {
            description:
                'Import review comments from a GitHub PR into agent-code-reviewer. Creates repo, session, snapshot, and comments automatically.',
            inputSchema: {
                repo_path: z.string().describe('Absolute path to the local repository'),
                branch: z.string().describe('Branch name the PR was created from'),
                base_branch: z.string().describe('Base branch the PR targets (e.g. main)'),
                pr_number: z.number().int().positive().describe('GitHub PR number'),
                raw_diff: z.string().describe('Full unified diff output from gh pr diff'),
                comments: z
                    .array(
                        z.object({
                            id: z.number().describe('GitHub comment ID'),
                            body: z.string().describe('Comment body text'),
                            path: z.string().describe('File path the comment is on'),
                            line: z.number().nullable().describe('Line number (null for file-level comments)'),
                            side: z
                                .enum(['LEFT', 'RIGHT'])
                                .nullable()
                                .describe('Diff side: LEFT (old) or RIGHT (new)'),
                            in_reply_to_id: z
                                .number()
                                .nullable()
                                .describe('GitHub ID of the parent comment if this is a reply'),
                            user: z.object({ login: z.string().describe('GitHub username') }),
                            created_at: z.string().describe('ISO 8601 timestamp'),
                        }),
                    )
                    .describe('Array of PR review comments from gh api'),
            },
        },
        async (input) => {
            try {
                const result = await client.importPrComments(input);

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: [
                                `Successfully imported ${result.imported_count} comment${result.imported_count !== 1 ? 's' : ''} from PR #${input.pr_number}.`,
                                `Session ID: ${result.session_id}`,
                                `Snapshot ID: ${result.snapshot_id}`,
                                '',
                                'The comments are now visible in agent-code-reviewer. Use check_comments to view them.',
                            ].join('\n'),
                        },
                    ],
                };
            } catch (e) {
                console.error('[mcp-server] import_pr_comments error:', e);
                return {
                    content: [
                        { type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` },
                    ],
                };
            }
        },
    );
}
