import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Database } from 'sql.js';
import { z } from 'zod';

interface CommentRow {
    id: string;
    session_id: string;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    side: string | null;
    content: string;
    status: string;
    author: string;
}

interface ReplyRow {
    id: string;
    content: string;
    author: string;
    status: string;
}

interface RepoRow {
    id: string;
    name: string;
}

interface SessionRow {
    id: string;
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

export function registerCheckComments(server: McpServer, db: Database): void {
    server.registerTool(
        'check_comments',
        {
            description: 'Find new (sent, unresolved) review comments for a repository',
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

                let repo: RepoRow | undefined;

                if (repo_path) {
                    const repoPathRows = queryRows<{ repo_id: string }>(
                        db,
                        'SELECT repo_id FROM repo_paths WHERE path = $path',
                        { $path: repo_path },
                    );
                    if (repoPathRows.length > 0) {
                        const repos = queryRows<RepoRow>(db, 'SELECT id, name FROM repos WHERE id = $id', {
                            $id: repoPathRows[0].repo_id,
                        });
                        repo = repos[0];
                    }
                }

                if (!repo && repo_name) {
                    const repos = queryRows<RepoRow>(db, 'SELECT id, name FROM repos WHERE name = $name', {
                        $name: repo_name,
                    });
                    repo = repos[0];
                }

                if (!repo) {
                    const identifier = repo_name ?? repo_path ?? 'unknown';
                    return {
                        content: [{ type: 'text' as const, text: `Error: Repository "${identifier}" not found.` }],
                    };
                }

                const sessions = queryRows<SessionRow>(
                    db,
                    'SELECT id FROM sessions WHERE repo_id = $repoId ORDER BY created_at DESC LIMIT 1',
                    { $repoId: repo.id },
                );

                if (sessions.length === 0) {
                    return {
                        content: [
                            { type: 'text' as const, text: `No unresolved comments found for repo "${repo.name}".` },
                        ],
                    };
                }

                const sessionId = sessions[0].id;

                const comments = queryRows<CommentRow>(
                    db,
                    `SELECT * FROM comments WHERE session_id = $sessionId AND status = 'sent' AND resolved_at IS NULL ORDER BY created_at`,
                    { $sessionId: sessionId },
                );

                if (comments.length === 0) {
                    return {
                        content: [
                            { type: 'text' as const, text: `No unresolved comments found for repo "${repo.name}".` },
                        ],
                    };
                }

                const lines: string[] = [
                    `Found ${comments.length} unresolved comment${comments.length !== 1 ? 's' : ''} for repo "${repo.name}":\n`,
                ];

                for (let i = 0; i < comments.length; i++) {
                    const c = comments[i];
                    let lineRef = c.file_path;
                    if (c.line_start != null) {
                        lineRef +=
                            c.line_end != null && c.line_end !== c.line_start
                                ? ` L${c.line_start}-${c.line_end}`
                                : ` L${c.line_start}`;
                    }
                    if (c.side) {
                        lineRef += ` (${c.side})`;
                    }

                    lines.push(`${i + 1}. [${c.id}] ${lineRef}`);
                    lines.push(`   "${c.content}"`);

                    const replies = queryRows<ReplyRow>(
                        db,
                        'SELECT id, content, author, status FROM comments WHERE reply_to_id = $parentId ORDER BY created_at',
                        { $parentId: c.id },
                    );

                    for (const reply of replies) {
                        lines.push(`   ↳ [${reply.author}] "${reply.content}" (${reply.status})`);
                    }

                    lines.push('');
                }

                lines.push(
                    'Use get_comment_details for full info, reply_to_comment to respond, or mark_comment_resolved to resolve.',
                );

                return {
                    content: [{ type: 'text' as const, text: lines.join('\n') }],
                };
            } catch (e) {
                console.error('[mcp-server] check_comments error:', e);
                return {
                    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
                };
            }
        },
    );
}
