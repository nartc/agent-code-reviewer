import initSqlJs, { type Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// We extract the handler logic by calling registerTool on a mock server
import { registerCheckComments } from '../tools/check-comments.js';
import { registerGetDetails } from '../tools/get-details.js';
import { registerMarkResolved } from '../tools/mark-resolved.js';
import { registerReplyToComment } from '../tools/reply-to-comment.js';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    remote_url TEXT UNIQUE,
    name TEXT NOT NULL,
    base_branch TEXT NOT NULL DEFAULT 'main',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repo_paths (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    path TEXT UNIQUE NOT NULL,
    last_accessed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    branch TEXT NOT NULL,
    base_branch TEXT,
    is_watching INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(repo_id, branch)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    raw_diff TEXT NOT NULL,
    files_summary TEXT NOT NULL,
    head_commit TEXT,
    trigger TEXT NOT NULL CHECK(trigger IN ('manual', 'fs_watch', 'initial')),
    changed_files TEXT,
    has_review_comments INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    reply_to_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    side TEXT CHECK(side IN ('old', 'new', 'both')),
    author TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'resolved')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS transport_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    active_transport TEXT NOT NULL DEFAULT 'tmux',
    last_target_id TEXT,
    settings TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

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

describe('MCP Tools', () => {
    let db: Database;
    let handlers: Record<string, ToolHandler>;

    beforeEach(async () => {
        const SQL = await initSqlJs();
        db = new SQL.Database();
        db.run(SCHEMA);

        const mockServer = createMockServer();
        registerCheckComments(mockServer as any, db);
        registerGetDetails(mockServer as any, db);
        registerReplyToComment(mockServer as any, db);
        registerMarkResolved(mockServer as any, db);
        handlers = mockServer.handlers;

        // Seed test data
        db.run("INSERT INTO repos (id, name, remote_url) VALUES ('repo1', 'my-app', 'https://github.com/test/my-app')");
        db.run("INSERT INTO repo_paths (id, repo_id, path) VALUES ('rp1', 'repo1', '/home/user/my-app')");
        db.run("INSERT INTO sessions (id, repo_id, branch) VALUES ('sess1', 'repo1', 'feature-branch')");
        db.run(
            "INSERT INTO snapshots (id, session_id, raw_diff, files_summary, trigger) VALUES ('snap1', 'sess1', 'diff content', '[]', 'manual')",
        );

        // Sent comments
        db.run(`INSERT INTO comments (id, session_id, snapshot_id, file_path, line_start, line_end, side, author, content, status, sent_at)
                VALUES ('c1', 'sess1', 'snap1', 'src/app.ts', 10, 15, 'new', 'user', 'Add error handling for the API call', 'sent', datetime('now'))`);
        db.run(`INSERT INTO comments (id, session_id, snapshot_id, file_path, line_start, line_end, side, author, content, status, sent_at)
                VALUES ('c2', 'sess1', 'snap1', 'src/utils.ts', 5, NULL, NULL, 'user', 'This function should be pure', 'sent', datetime('now'))`);

        // A reply to c1
        db.run(`INSERT INTO comments (id, session_id, snapshot_id, reply_to_id, file_path, line_start, line_end, side, author, content, status)
                VALUES ('reply1', 'sess1', 'snap1', 'c1', 'src/app.ts', 10, 15, 'new', 'agent', 'I will add a try-catch block', 'draft')`);

        // Draft comment (should not show in check_comments)
        db.run(`INSERT INTO comments (id, session_id, snapshot_id, file_path, line_start, line_end, side, author, content, status)
                VALUES ('c3', 'sess1', 'snap1', 'src/other.ts', 1, NULL, NULL, 'user', 'Draft comment', 'draft')`);
    });

    afterEach(() => {
        db.close();
    });

    describe('check_comments', () => {
        it('finds sent unresolved comments by repo_name', async () => {
            const result = await handlers['check_comments']({ repo_name: 'my-app' });
            const text = getText(result);
            expect(text).toContain('Found 2 unresolved comments');
            expect(text).toContain('[c1]');
            expect(text).toContain('src/app.ts');
            expect(text).toContain('[c2]');
            expect(text).toContain('src/utils.ts');
        });

        it('finds comments by repo_path', async () => {
            const result = await handlers['check_comments']({ repo_path: '/home/user/my-app' });
            const text = getText(result);
            expect(text).toContain('Found 2 unresolved comments');
        });

        it('returns "no comments" when none are sent', async () => {
            db.run("UPDATE comments SET status = 'draft', sent_at = NULL WHERE status = 'sent'");
            const result = await handlers['check_comments']({ repo_name: 'my-app' });
            const text = getText(result);
            expect(text).toContain('No unresolved comments');
        });

        it('returns error for non-existent repo', async () => {
            const result = await handlers['check_comments']({ repo_name: 'unknown' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('"unknown" not found');
        });

        it('returns error when neither repo_path nor repo_name provided', async () => {
            const result = await handlers['check_comments']({});
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('At least one of repo_path or repo_name is required');
        });

        it('includes reply information', async () => {
            const result = await handlers['check_comments']({ repo_name: 'my-app' });
            const text = getText(result);
            expect(text).toContain('try-catch');
            expect(text).toContain('[agent]');
        });
    });

    describe('get_comment_details', () => {
        it('returns full comment with replies', async () => {
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
            const result = await handlers['get_comment_details']({ comment_id: 'xxx' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('"xxx" not found');
        });
    });

    describe('reply_to_comment', () => {
        it('creates reply with inherited fields', async () => {
            const result = await handlers['reply_to_comment']({
                comment_id: 'c1',
                content: 'Fixed in latest commit',
            });
            const text = getText(result);
            expect(text).toContain('Reply created successfully');
            expect(text).toContain('Parent: [c1]');
            expect(text).toContain('draft');

            // Verify in DB
            const stmt = db.prepare(
                "SELECT * FROM comments WHERE reply_to_id = 'c1' AND content = 'Fixed in latest commit'",
            );
            expect(stmt.step()).toBe(true);
            const row = stmt.getAsObject();
            expect(row['author']).toBe('agent');
            expect(row['session_id']).toBe('sess1');
            expect(row['snapshot_id']).toBe('snap1');
            expect(row['file_path']).toBe('src/app.ts');
            expect(row['line_start']).toBe(10);
            expect(row['line_end']).toBe(15);
            expect(row['side']).toBe('new');
            expect(row['status']).toBe('draft');
            stmt.free();
        });

        it('returns error for non-existent parent', async () => {
            const result = await handlers['reply_to_comment']({
                comment_id: 'xxx',
                content: 'text',
            });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('"xxx" not found');
        });
    });

    describe('mark_comment_resolved', () => {
        it('resolves a sent comment', async () => {
            const result = await handlers['mark_comment_resolved']({ comment_id: 'c1' });
            const text = getText(result);
            expect(text).toContain('Comment [c1] marked as resolved');

            // Verify in DB
            const stmt = db.prepare("SELECT status, resolved_at FROM comments WHERE id = 'c1'");
            stmt.step();
            const row = stmt.getAsObject();
            expect(row['status']).toBe('resolved');
            expect(row['resolved_at']).not.toBeNull();
            stmt.free();
        });

        it('rejects draft comment', async () => {
            const result = await handlers['mark_comment_resolved']({ comment_id: 'c3' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain("must be in 'sent' status");
            expect(text).toContain('draft');
        });

        it('rejects already resolved comment', async () => {
            db.run("UPDATE comments SET status = 'resolved', resolved_at = datetime('now') WHERE id = 'c1'");
            const result = await handlers['mark_comment_resolved']({ comment_id: 'c1' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain("must be in 'sent' status");
            expect(text).toContain('resolved');
        });

        it('returns error for non-existent comment', async () => {
            const result = await handlers['mark_comment_resolved']({ comment_id: 'xxx' });
            const text = getText(result);
            expect(text).toContain('Error');
            expect(text).toContain('"xxx" not found');
        });
    });
});
