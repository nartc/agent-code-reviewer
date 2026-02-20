import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment, CommentThread } from '@agent-code-reviewer/shared';
import { ApiClient } from '../api-client.js';
import { registerCheckComments } from '../tools/check-comments.js';
import { registerGetDetails } from '../tools/get-details.js';
import { registerMarkResolved } from '../tools/mark-resolved.js';
import { registerReplyToComment } from '../tools/reply-to-comment.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

function createMockServer(): {
    registerTool: (name: string, config: unknown, cb: ToolHandler) => void;
    handlers: Record<string, ToolHandler>;
} {
    const handlers: Record<string, ToolHandler> = {};
    return {
        registerTool(name: string, _config: unknown, cb: ToolHandler) {
            handlers[name] = cb;
        },
        handlers,
    };
}

function getText(result: { content: Array<{ type: string; text: string }> }): string {
    return result.content[0].text;
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
    return {
        id: 'c1',
        session_id: 'sess1',
        snapshot_id: 'snap1',
        reply_to_id: null,
        file_path: 'src/app.ts',
        line_start: 10,
        line_end: 15,
        side: 'new',
        author: 'user',
        content: 'Add error handling for the API call',
        status: 'sent',
        created_at: '2024-01-01T00:00:00Z',
        sent_at: '2024-01-01T00:00:01Z',
        resolved_at: null,
        ...overrides,
    };
}

function makeThread(commentOverrides: Partial<Comment> = {}, replies: Comment[] = []): CommentThread {
    return { comment: makeComment(commentOverrides), replies };
}

describe('MCP Tools', () => {
    let client: ApiClient;
    let handlers: Record<string, ToolHandler>;

    beforeEach(() => {
        client = new ApiClient('http://localhost:3847');
        vi.spyOn(client, 'getUnresolvedComments');
        vi.spyOn(client, 'getCommentThread');
        vi.spyOn(client, 'createReply');
        vi.spyOn(client, 'resolveComment');

        const mockServer = createMockServer();
        registerCheckComments(mockServer as any, client);
        registerGetDetails(mockServer as any, client);
        registerReplyToComment(mockServer as any, client);
        registerMarkResolved(mockServer as any, client);
        handlers = mockServer.handlers;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('check_comments', () => {
        it('finds sent unresolved comments by repo_name', async () => {
            const reply = makeComment({ id: 'reply1', reply_to_id: 'c1', author: 'agent', content: 'I will add a try-catch block', status: 'draft' });
            vi.mocked(client.getUnresolvedComments).mockResolvedValue({
                threads: [
                    makeThread({}, [reply]),
                    makeThread({ id: 'c2', file_path: 'src/utils.ts', line_start: 5, line_end: null, side: null, content: 'This function should be pure' }),
                ],
                repo_name: 'my-app',
            });

            const result = await handlers['check_comments']({ repo_name: 'my-app' });
            const text = getText(result);
            expect(text).toContain('Found 2 unresolved comments');
            expect(text).toContain('[c1]');
            expect(text).toContain('src/app.ts');
            expect(text).toContain('[c2]');
            expect(text).toContain('src/utils.ts');
        });

        it('finds comments by repo_path', async () => {
            vi.mocked(client.getUnresolvedComments).mockResolvedValue({
                threads: [makeThread(), makeThread({ id: 'c2' })],
                repo_name: 'my-app',
            });

            const result = await handlers['check_comments']({ repo_path: '/home/user/my-app' });
            const text = getText(result);
            expect(text).toContain('Found 2 unresolved comments');
        });

        it('returns "no comments" when none are sent', async () => {
            vi.mocked(client.getUnresolvedComments).mockResolvedValue({ threads: [], repo_name: 'my-app' });

            const result = await handlers['check_comments']({ repo_name: 'my-app' });
            const text = getText(result);
            expect(text).toContain('No unresolved comments');
        });

        it('returns error for non-existent repo', async () => {
            vi.mocked(client.getUnresolvedComments).mockRejectedValue(new Error('Repo not found'));

            const result = await handlers['check_comments']({ repo_name: 'unknown' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('Repo not found');
        });

        it('returns error when neither repo_path nor repo_name provided', async () => {
            const result = await handlers['check_comments']({});
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('At least one of repo_path or repo_name is required');
        });

        it('passes snapshot_id to filter comments', async () => {
            vi.mocked(client.getUnresolvedComments).mockResolvedValue({
                threads: [makeThread()],
                repo_name: 'my-app',
            });

            const result = await handlers['check_comments']({ repo_name: 'my-app', snapshot_id: 'snap1' });
            const text = getText(result);
            expect(text).toContain('Found 1 unresolved comment');
            expect(vi.mocked(client.getUnresolvedComments)).toHaveBeenCalledWith({
                repo_path: undefined,
                repo_name: 'my-app',
                snapshot_id: 'snap1',
            });
        });

        it('includes reply information', async () => {
            const reply = makeComment({ id: 'reply1', reply_to_id: 'c1', author: 'agent', content: 'I will add a try-catch block', status: 'draft' });
            vi.mocked(client.getUnresolvedComments).mockResolvedValue({
                threads: [makeThread({}, [reply])],
                repo_name: 'my-app',
            });

            const result = await handlers['check_comments']({ repo_name: 'my-app' });
            const text = getText(result);
            expect(text).toContain('try-catch');
            expect(text).toContain('[agent]');
        });
    });

    describe('get_comment_details', () => {
        it('returns full comment with replies', async () => {
            const reply = makeComment({ id: 'reply1', reply_to_id: 'c1', author: 'agent', content: 'I will add a try-catch block', status: 'draft', created_at: '2024-01-01T01:00:00Z' });
            vi.mocked(client.getCommentThread).mockResolvedValue({
                thread: makeThread({}, [reply]),
            });

            const result = await handlers['get_comment_details']({ comment_id: 'c1' });
            const text = getText(result);
            expect(text).toContain('Comment [c1]');
            expect(text).toContain('src/app.ts');
            expect(text).toContain('10-15');
            expect(text).toContain('new side');
            expect(text).toContain('user');
            expect(text).toContain('sent');
            expect(text).toContain('Replies (1)');
            expect(text).toContain('[reply1]');
            expect(text).toContain('try-catch');
        });

        it('returns error for non-existent comment', async () => {
            vi.mocked(client.getCommentThread).mockRejectedValue(new Error('Comment not found'));

            const result = await handlers['get_comment_details']({ comment_id: 'xxx' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('Comment not found');
        });
    });

    describe('reply_to_comment', () => {
        it('creates reply successfully', async () => {
            vi.mocked(client.createReply).mockResolvedValue(
                makeComment({ id: 'new-reply', reply_to_id: 'c1', author: 'agent', content: 'Fixed in latest commit', status: 'sent' }),
            );

            const result = await handlers['reply_to_comment']({
                comment_id: 'c1',
                content: 'Fixed in latest commit',
            });
            const text = getText(result);
            expect(text).toContain('Reply created successfully');
            expect(text).toContain('Parent: [c1]');
            expect(text).toContain('sent');
        });

        it('returns error for non-existent parent', async () => {
            vi.mocked(client.createReply).mockRejectedValue(new Error('Parent comment not found'));

            const result = await handlers['reply_to_comment']({
                comment_id: 'xxx',
                content: 'text',
            });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('Parent comment not found');
        });
    });

    describe('mark_comment_resolved', () => {
        it('resolves a sent comment', async () => {
            vi.mocked(client.resolveComment).mockResolvedValue(
                makeComment({ id: 'c1', status: 'resolved', resolved_at: '2024-01-01T02:00:00Z' }),
            );

            const result = await handlers['mark_comment_resolved']({ comment_id: 'c1' });
            const text = getText(result);
            expect(text).toContain('Comment [c1] marked as resolved');
        });

        it('rejects draft comment', async () => {
            vi.mocked(client.resolveComment).mockRejectedValue(new Error("Cannot resolve draft comments, send first"));

            const result = await handlers['mark_comment_resolved']({ comment_id: 'c3' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('Cannot resolve draft comments');
        });

        it('returns error for non-existent comment', async () => {
            vi.mocked(client.resolveComment).mockRejectedValue(new Error('Comment not found'));

            const result = await handlers['mark_comment_resolved']({ comment_id: 'xxx' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('Comment not found');
        });
    });
});
