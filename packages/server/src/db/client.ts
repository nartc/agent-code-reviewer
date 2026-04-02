import { type AppError, databaseError } from '@agent-code-reviewer/shared';
import { err, ok, type Result } from 'neverthrow';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type Database } from 'sql.js';

export type { Database } from 'sql.js';

/**
 * Initialize sql.js and either load an existing DB file or create a new one.
 * Runs the schema DDL and migrations.
 */
export async function initDatabase(dbPath: string): Promise<Result<Database, AppError>> {
    try {
        const SQL = await initSqlJs();

        let db: Database;
        if (existsSync(dbPath)) {
            const buffer = readFileSync(dbPath);
            db = new SQL.Database(buffer);
        } else {
            mkdirSync(dirname(dbPath), { recursive: true });
            db = new SQL.Database();
        }

        // Run schema
        const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
        const schema = readFileSync(schemaPath, 'utf-8');
        db.run(schema);

        // Run migrations
        runMigrations(db);

        return ok(db);
    } catch (e) {
        return err(
            databaseError(
                `Failed to initialize database at ${dbPath}: ${e instanceof Error ? e.message : String(e)}`,
                e,
            ),
        );
    }
}

/**
 * Initialize an in-memory database (for tests).
 */
export async function initInMemoryDatabase(): Promise<Result<Database, AppError>> {
    try {
        const SQL = await initSqlJs();
        const db = new SQL.Database();

        const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
        const schema = readFileSync(schemaPath, 'utf-8');
        db.run(schema);

        runMigrations(db);

        return ok(db);
    } catch (e) {
        return err(
            databaseError(`Failed to initialize in-memory database: ${e instanceof Error ? e.message : String(e)}`, e),
        );
    }
}

export function runMigrations(db: Database): void {
    // Check current schema version
    const result = db.exec("SELECT value FROM app_config WHERE key = 'schema_version'");
    let currentVersion = result.length > 0 ? String(result[0].values[0][0]) : null;

    if (currentVersion === null) {
        // Fresh DB — schema.sql already ran above, just record version
        db.run("INSERT INTO app_config (key, value) VALUES ('schema_version', '3')");
        currentVersion = '3';
    }

    if (currentVersion === '1') {
        // Migrate from repo + repo_paths (one-to-many) to flat repos with path column.
        // Each repo_path becomes its own repo entry.

        // Check if repo_paths table exists (it won't on fresh DBs)
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='repo_paths'");
        if (tables.length > 0 && tables[0].values.length > 0) {
            // Get all repo_paths grouped by repo
            const rows = db.exec(`
                SELECT rp.id as path_id, rp.repo_id, rp.path, r.remote_url, r.name, r.base_branch, r.created_at
                FROM repo_paths rp
                JOIN repos r ON rp.repo_id = r.id
                ORDER BY rp.created_at ASC
            `);

            // Recreate repos table with new schema (SQLite can't ALTER to add NOT NULL without default)
            db.run('DROP INDEX IF EXISTS idx_repo_paths_repo');
            db.run('DROP TABLE IF EXISTS repo_paths');

            // Rebuild repos table with path column, no UNIQUE on remote_url
            db.run('ALTER TABLE repos RENAME TO repos_old');
            db.run(`CREATE TABLE repos (
                id TEXT PRIMARY KEY,
                remote_url TEXT,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                base_branch TEXT NOT NULL DEFAULT 'main',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`);

            if (rows.length > 0) {
                const seenRepoIds = new Set<string>();
                for (const row of rows[0].values) {
                    const [, repoId, path, remoteUrl, name, baseBranch, createdAt] = row as string[];
                    if (!seenRepoIds.has(repoId)) {
                        // First path for this repo — reuse the original repo ID so sessions stay linked
                        seenRepoIds.add(repoId);
                        db.run(
                            'INSERT INTO repos (id, remote_url, name, path, base_branch, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                            [repoId, remoteUrl, name, path, baseBranch, createdAt],
                        );
                    } else {
                        // Additional path — create new repo entry with new ID
                        const newId = `repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        db.run(
                            'INSERT INTO repos (id, remote_url, name, path, base_branch, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                            [newId, remoteUrl, name, path, baseBranch, createdAt],
                        );
                    }
                }
            }

            db.run('DROP TABLE repos_old');
        }

        db.run("UPDATE app_config SET value = '2' WHERE key = 'schema_version'");
        currentVersion = '2';
    }

    if (currentVersion === '2') {
        // Add session lifecycle columns and remove UNIQUE(repo_id, branch) so historical
        // completed sessions can coexist with one active session per repo+branch.
        db.run('PRAGMA foreign_keys = OFF');
        db.run('BEGIN');

        try {
            db.run(`CREATE TABLE sessions_new (
                id TEXT PRIMARY KEY,
                repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
                branch TEXT NOT NULL,
                base_branch TEXT,
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
                completed_at TEXT,
                completion_reason TEXT,
                is_watching INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )`);

            db.run(`INSERT INTO sessions_new (id, repo_id, branch, base_branch, status, completed_at, completion_reason, is_watching, created_at)
                SELECT id, repo_id, branch, base_branch, 'active', NULL, NULL, is_watching, created_at
                FROM sessions`);

            db.run('DROP TABLE sessions');
            db.run('ALTER TABLE sessions_new RENAME TO sessions');

            db.run('CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_id)');
            db.run(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_repo_branch_active ON sessions(repo_id, branch) WHERE status = 'active'",
            );

            db.run("UPDATE app_config SET value = '3' WHERE key = 'schema_version'");
            db.run('COMMIT');
            currentVersion = '3';
        } catch (e) {
            db.run('ROLLBACK');
            throw e;
        } finally {
            db.run('PRAGMA foreign_keys = ON');
        }
    }
}
