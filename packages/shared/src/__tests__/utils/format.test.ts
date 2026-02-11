import type { CommentPayload } from '../../types/transport.js';
import { formatCommentsForTransport } from '../../utils/format.js';

describe('formatCommentsForTransport', () => {
  it('formats a single comment correctly', () => {
    const payload: CommentPayload = {
      file_path: 'src/app.ts',
      line_start: 12,
      line_end: 15,
      side: 'new',
      content: 'Fix this',
      status: 'draft',
      author: 'user',
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('### src/app.ts');
    expect(result).toContain('**L12-15 (new):** Fix this');
    expect(result).toContain('1 comment across 1 file');
  });

  it('groups multiple files', () => {
    const payloads: CommentPayload[] = [
      { file_path: 'a.ts', line_start: 1, line_end: null, side: null, content: 'c1', status: 'draft', author: 'user' },
      { file_path: 'b.ts', line_start: 2, line_end: null, side: null, content: 'c2', status: 'draft', author: 'user' },
    ];
    const result = formatCommentsForTransport(payloads);
    expect(result).toContain('### a.ts');
    expect(result).toContain('### b.ts');
    expect(result).toContain('2 comments across 2 files');
  });

  it('formats single line (no range) when line_end is null', () => {
    const payload: CommentPayload = {
      file_path: 'f.ts',
      line_start: 45,
      line_end: null,
      side: null,
      content: 'Check this',
      status: 'draft',
      author: 'user',
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('**L45:** Check this');
    expect(result).not.toContain('L45-');
  });

  it('formats single line (same start and end)', () => {
    const payload: CommentPayload = {
      file_path: 'f.ts',
      line_start: 45,
      line_end: 45,
      side: null,
      content: 'Check this',
      status: 'draft',
      author: 'user',
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('**L45:** Check this');
    expect(result).not.toContain('L45-');
  });

  it('handles null lines (session-level comment)', () => {
    const payload: CommentPayload = {
      file_path: '[general]',
      line_start: null,
      line_end: null,
      side: null,
      content: 'Overall looks good',
      status: 'draft',
      author: 'user',
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('Overall looks good');
    expect(result).not.toContain('**L');
  });

  it('indents thread replies with arrow prefix', () => {
    const payload: CommentPayload = {
      file_path: 'f.ts',
      line_start: 10,
      line_end: null,
      side: null,
      content: 'Fix this',
      status: 'draft',
      author: 'user',
      thread_replies: [{ content: 'Agreed', author: 'agent' }],
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('  \u21b3 [agent] Agreed');
  });

  it('shows correct footer count with multiple comments across files', () => {
    const payloads: CommentPayload[] = [
      { file_path: 'a.ts', line_start: 1, line_end: null, side: null, content: 'c1', status: 'draft', author: 'user' },
      { file_path: 'a.ts', line_start: 2, line_end: null, side: null, content: 'c2', status: 'draft', author: 'user' },
      { file_path: 'b.ts', line_start: 3, line_end: null, side: null, content: 'c3', status: 'draft', author: 'user' },
    ];
    const result = formatCommentsForTransport(payloads);
    expect(result).toContain('3 comments across 2 files');
  });

  it('returns "No comments." for empty array', () => {
    const result = formatCommentsForTransport([]);
    expect(result).toContain('No comments.');
  });

  it('preserves special characters in content', () => {
    const payload: CommentPayload = {
      file_path: 'f.ts',
      line_start: 1,
      line_end: null,
      side: null,
      content: '<script>alert("xss")</script> `backticks` \u00e9\u00e8\u00ea',
      status: 'draft',
      author: 'user',
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('<script>alert("xss")</script> `backticks` \u00e9\u00e8\u00ea');
  });

  it('omits side when side is null', () => {
    const payload: CommentPayload = {
      file_path: 'f.ts',
      line_start: 10,
      line_end: null,
      side: null,
      content: 'content',
      status: 'draft',
      author: 'user',
    };
    const result = formatCommentsForTransport([payload]);
    expect(result).toContain('**L10:** content');
    expect(result).not.toMatch(/\(null\)/);
    expect(result).not.toMatch(/\(old\)/);
    expect(result).not.toMatch(/\(new\)/);
  });
});
