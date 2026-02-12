PRAGMA journal_mode = WAL;
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

CREATE INDEX IF NOT EXISTS idx_repo_paths_repo ON repo_paths(repo_id);
CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_session ON comments(session_id);
CREATE INDEX IF NOT EXISTS idx_comments_snapshot ON comments(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(session_id, file_path);
CREATE INDEX IF NOT EXISTS idx_comments_reply ON comments(reply_to_id);
