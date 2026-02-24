import type { CommentPayload } from '../types/transport.js';

export interface FormatOptions {
    snapshot_id?: string;
}

export function formatCommentsForTransport(comments: CommentPayload[], options?: FormatOptions): string {
    if (comments.length === 0) {
        return '## Code Review Comments\n\nNo comments.\n';
    }

    // Group by file_path
    const grouped: Record<string, CommentPayload[]> = {};
    for (const c of comments) {
        const group = grouped[c.file_path] ?? [];
        group.push(c);
        grouped[c.file_path] = group;
    }

    const lines: string[] = ['## Code Review Comments', ''];

    for (const [filePath, fileComments] of Object.entries(grouped)) {
        lines.push(`### ${filePath}`);
        for (const c of fileComments) {
            // Line reference
            if (c.line_start != null) {
                let lineRef =
                    c.line_end != null && c.line_end !== c.line_start
                        ? `L${c.line_start}-${c.line_end}`
                        : `L${c.line_start}`;
                if (c.side != null) {
                    lineRef += ` (${c.side})`;
                }
                lines.push(`**[${c.id}] ${lineRef}:** ${c.content}`);
            } else {
                // Session-level comment (null lines)
                lines.push(`[${c.id}] ${c.content}`);
            }

            // Thread replies
            if (c.thread_replies) {
                for (const reply of c.thread_replies) {
                    lines.push(`  \u21b3 [${reply.id}] [${reply.author}] ${reply.content}`);
                }
            }
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(
        `${comments.length} comment${comments.length !== 1 ? 's' : ''} across ${Object.keys(grouped).length} file${Object.keys(grouped).length !== 1 ? 's' : ''}`,
    );
    lines.push('');
    lines.push('Each comment includes its ID in brackets [id].');
    lines.push('To respond, use the agent-code-reviewer MCP tools:');
    lines.push('- reply_to_comment: reply to a comment by ID');
    lines.push('- mark_resolved: mark a comment as addressed by ID');

    return lines.join('\n');
}
