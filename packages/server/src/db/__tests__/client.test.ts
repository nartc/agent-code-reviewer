import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import initSqlJs from 'sql.js';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initDatabase, initInMemoryDatabase } from '../client.js';

describe('Database Client', () => {
    describe('initInMemoryDatabase', () => {
        it('creates all 6 tables', async () => {
            const result = await initInMemoryDatabase();
            expect(result.isOk()).toBe(true);

            const db = expectOk(result);
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
            const tableNames = tables[0].values.map((row: any[]) => row[0]);

            expect(tableNames).toContain('app_config');
            expect(tableNames).toContain('comments');
            expect(tableNames).toContain('repos');
            expect(tableNames).toContain('sessions');
            expect(tableNames).toContain('snapshots');
            expect(tableNames).toContain('transport_config');
            expect(tableNames).not.toContain('repo_paths');

            db.close();
        });

        it('creates all 9 indexes', async () => {
            const result = await initInMemoryDatabase();

            const db = expectOk(result);
            const indexes = db.exec(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
            );
            const indexNames = indexes[0].values.map((row: any[]) => row[0]);

            expect(indexNames).toEqual([
                'idx_comments_file',
                'idx_comments_reply',
                'idx_comments_session',
                'idx_comments_snapshot',
                'idx_comments_status',
                'idx_sessions_repo',
                'idx_sessions_repo_branch_active',
                'idx_snapshots_created',
                'idx_snapshots_session',
            ]);

            db.close();
        });

        it('enforces foreign key constraints', async () => {
            const result = await initInMemoryDatabase();

            const db = expectOk(result);

            expect(() => {
                db.run("INSERT INTO sessions (id, repo_id, branch) VALUES ('s1', 'nonexistent', 'main')");
            }).toThrow();

            db.close();
        });

        it('tracks migration version', async () => {
            const result = await initInMemoryDatabase();

            const db = expectOk(result);
            const version = db.exec("SELECT value FROM app_config WHERE key = 'schema_version'");

            expect(version[0].values[0][0]).toBe('4');

            db.close();
        });

        it('applies schema idempotently', async () => {
            const result = await initInMemoryDatabase();

            const db = expectOk(result);

            // Run schema again — should not throw
            const schemaPath = new URL('../schema.sql', import.meta.url);
            const { readFileSync: readFile } = await import('node:fs');
            const { fileURLToPath } = await import('node:url');
            const schema = readFile(fileURLToPath(schemaPath), 'utf-8');

            expect(() => db.run(schema)).not.toThrow();

            db.close();
        });
    });

    describe('initDatabase (file-based)', () => {
        let tmpPath: string;

        beforeEach(() => {
            tmpPath = join(tmpdir(), `test-db-${randomUUID()}`, 'sub', 'dir', 'test.db');
        });

        afterEach(() => {
            // Clean up the temp directory
            const rootDir = join(tmpdir(), tmpPath.split('/').find((s) => s.startsWith('test-db-'))!);
            if (existsSync(rootDir)) {
                rmSync(rootDir, { recursive: true });
            }
        });

        it('creates parent directories and initializes DB', async () => {
            const result = await initDatabase(tmpPath);
            expect(result.isOk()).toBe(true);

            const db = expectOk(result);

            // Export and write to verify persistence
            const data = db.export();
            writeFileSync(tmpPath, Buffer.from(data));

            expect(existsSync(tmpPath)).toBe(true);
            const fileContent = readFileSync(tmpPath);
            expect(fileContent.length).toBeGreaterThan(0);

            db.close();
        });

        it('returns error for invalid path', async () => {
            const result = await initDatabase('/dev/null/impossible/path.db');
            expect(result.isErr()).toBe(true);
            expect(expectErr(result).type).toBe('DATABASE_ERROR');
        });

        it('migrates existing v2 database before applying latest schema', async () => {
            const SQL = await initSqlJs();
            const legacyDb = new SQL.Database();

            legacyDb.run(`
                PRAGMA foreign_keys = ON;
                CREATE TABLE repos (
                    id TEXT PRIMARY KEY,
                    remote_url TEXT,
                    name TEXT NOT NULL,
                    path TEXT UNIQUE NOT NULL,
                    base_branch TEXT NOT NULL DEFAULT 'main',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
                    branch TEXT NOT NULL,
                    base_branch TEXT,
                    is_watching INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(repo_id, branch)
                );
                CREATE TABLE snapshots (
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
                CREATE TABLE app_config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                INSERT INTO repos (id, name, path, base_branch) VALUES ('r1', 'repo', '/tmp/repo', 'main');
                INSERT INTO sessions (id, repo_id, branch, base_branch, is_watching) VALUES ('s1', 'r1', 'main', 'main', 1);
                INSERT INTO app_config (key, value) VALUES ('schema_version', '2');
            `);

            mkdirSync(dirname(tmpPath), { recursive: true });
            writeFileSync(tmpPath, Buffer.from(legacyDb.export()));
            legacyDb.close();

            const result = await initDatabase(tmpPath);
            expect(result.isOk()).toBe(true);

            const db = expectOk(result);
            const status = db.exec("SELECT status, completed_at, completion_reason FROM sessions WHERE id = 's1'");
            expect(status[0].values[0]).toEqual(['active', null, null]);

            const version = db.exec("SELECT value FROM app_config WHERE key = 'schema_version'");
            expect(version[0].values[0][0]).toBe('4');

            db.close();
        });

        it('migrates v3 snapshots trigger check to include mcp', async () => {
            const SQL = await initSqlJs();
            const legacyDb = new SQL.Database();

            legacyDb.run(`
                PRAGMA foreign_keys = ON;
                CREATE TABLE repos (
                    id TEXT PRIMARY KEY,
                    remote_url TEXT,
                    name TEXT NOT NULL,
                    path TEXT UNIQUE NOT NULL,
                    base_branch TEXT NOT NULL DEFAULT 'main',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
                    branch TEXT NOT NULL,
                    base_branch TEXT,
                    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
                    completed_at TEXT,
                    completion_reason TEXT,
                    is_watching INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE snapshots (
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
                CREATE TABLE app_config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                INSERT INTO repos (id, name, path, base_branch) VALUES ('r1', 'repo', '/tmp/repo-v3', 'main');
                INSERT INTO sessions (id, repo_id, branch, base_branch, status, is_watching) VALUES ('s1', 'r1', 'main', 'main', 'active', 0);
                INSERT INTO app_config (key, value) VALUES ('schema_version', '3');
            `);

            mkdirSync(dirname(tmpPath), { recursive: true });
            writeFileSync(tmpPath, Buffer.from(legacyDb.export()));
            legacyDb.close();

            const result = await initDatabase(tmpPath);
            expect(result.isOk()).toBe(true);

            const db = expectOk(result);

            expect(() => {
                db.run(
                    `INSERT INTO snapshots (id, session_id, raw_diff, files_summary, head_commit, trigger, changed_files, has_review_comments)
                     VALUES ('snap_mcp', 's1', 'diff --git a/a b/a', '[]', NULL, 'mcp', NULL, 0)`,
                );
            }).not.toThrow();

            const version = db.exec("SELECT value FROM app_config WHERE key = 'schema_version'");
            expect(version[0].values[0][0]).toBe('4');

            db.close();
        });
    });
});
