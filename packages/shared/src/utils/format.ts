import type { CommentPayload } from '../types/transport.js';

export function formatCommentsForTransport(comments: CommentPayload[]): string {
  if (comments.length === 0) {
    return '## Code Review Comments\n\nNo comments.\n';
  }

  // Group by file_path
  const grouped = new Map<string, CommentPayload[]>();
  for (const c of comments) {
    const group = grouped.get(c.file_path) ?? [];
    group.push(c);
    grouped.set(c.file_path, group);
  }

  const lines: string[] = ['## Code Review Comments', ''];

  for (const [filePath, fileComments] of grouped) {
    lines.push(`### ${filePath}`);
    for (const c of fileComments) {
      // Line reference
      let lineRef = '';
      if (c.line_start != null) {
        lineRef = c.line_end != null && c.line_end !== c.line_start
          ? `L${c.line_start}-${c.line_end}`
          : `L${c.line_start}`;
        if (c.side != null) {
          lineRef += ` (${c.side})`;
        }
        lines.push(`**${lineRef}:** ${c.content}`);
      } else {
        // Session-level comment (null lines)
        lines.push(c.content);
      }

      // Thread replies
      if (c.thread_replies) {
        for (const reply of c.thread_replies) {
          lines.push(`  \u21b3 [${reply.author}] ${reply.content}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`${comments.length} comment${comments.length !== 1 ? 's' : ''} across ${grouped.size} file${grouped.size !== 1 ? 's' : ''}`);

  return lines.join('\n');
}
