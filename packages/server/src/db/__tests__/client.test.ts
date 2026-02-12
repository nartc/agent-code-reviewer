import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initDatabase, initInMemoryDatabase } from '../client.js';

describe('Database Client', () => {
    describe('initInMemoryDatabase', () => {
        it('creates all 7 tables', async () => {
            const result = await initInMemoryDatabase();
            expect(result.isOk()).toBe(true);

            const db = expectOk(result);
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
            const tableNames = tables[0].values.map((row: any[]) => row[0]);

            expect(tableNames).toContain('app_config');
            expect(tableNames).toContain('comments');
            expect(tableNames).toContain('repo_paths');
            expect(tableNames).toContain('repos');
            expect(tableNames).toContain('sessions');
            expect(tableNames).toContain('snapshots');
            expect(tableNames).toContain('transport_config');

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
                'idx_repo_paths_repo',
                'idx_sessions_repo',
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

            expect(version[0].values[0][0]).toBe('1');

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
    });
});
