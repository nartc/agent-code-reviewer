import { databaseError } from '@agent-code-reviewer/shared';
import { err, ok } from 'neverthrow';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { initInMemoryDatabase } from '../../db/client.js';
import { DbService } from '../db.service.js';

describe('DbService', () => {
    let service: DbService;
    let tmpPath: string;
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = join(tmpdir(), `test-dbservice-${randomUUID()}`);
        tmpPath = join(tmpDir, 'test.db');

        const result = await initInMemoryDatabase();
        expect(result.isOk()).toBe(true);

        const db = result._unsafeUnwrap();
        service = new DbService(db, tmpPath, {
            autoSave: false,
            shutdownHooks: false,
        });
    });

    afterEach(() => {
        try {
            service.close();
        } catch {
            // ignore if already closed
        }
        if (existsSync(tmpDir)) {
            rmSync(tmpDir, { recursive: true });
        }
    });

    describe('query', () => {
        it('returns rows', () => {
            service.execute("INSERT INTO repos (id, name) VALUES ('r1', 'repo1')");
            service.execute("INSERT INTO repos (id, name) VALUES ('r2', 'repo2')");
            service.execute("INSERT INTO repos (id, name) VALUES ('r3', 'repo3')");

            const result = service.query<{ id: string; name: string }>('SELECT id, name FROM repos');

            expect(result.isOk()).toBe(true);
            const rows = result._unsafeUnwrap();
            expect(rows).toHaveLength(3);
            expect(rows[0]).toHaveProperty('id');
            expect(rows[0]).toHaveProperty('name');
        });

        it('returns empty array for no matches', () => {
            const result = service.query('SELECT * FROM repos WHERE id = $id', { $id: 'nonexistent' });

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual([]);
        });
    });

    describe('queryOne', () => {
        it('returns single row', () => {
            service.execute("INSERT INTO repos (id, name) VALUES ('r1', 'test')");

            const result = service.queryOne<{ id: string; name: string }>('SELECT * FROM repos WHERE id = $id', {
                $id: 'r1',
            });

            expect(result.isOk()).toBe(true);
            const row = result._unsafeUnwrap();
            expect(row).toBeDefined();
            expect(row!.id).toBe('r1');
            expect(row!.name).toBe('test');
        });

        it('returns undefined for no match', () => {
            const result = service.queryOne('SELECT * FROM repos WHERE id = $id', { $id: 'nope' });

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBeUndefined();
        });
    });

    describe('execute', () => {
        it('returns changes count', () => {
            const result = service.execute("INSERT INTO repos (id, name) VALUES ('r1', 'test')");

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual({ changes: 1 });
        });

        it('returns error for invalid SQL', () => {
            const result = service.execute('INVALID SQL STATEMENT');

            expect(result.isErr()).toBe(true);
            expect(result._unsafeUnwrapErr().type).toBe('DATABASE_ERROR');
        });
    });

    describe('transaction', () => {
        it('commits on success', () => {
            const result = service.transaction(() => {
                service.execute("INSERT INTO repos (id, name) VALUES ('r1', 'test')");
                return ok('done');
            });

            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe('done');

            // Verify data is committed
            const query = service.queryOne<{ id: string }>("SELECT * FROM repos WHERE id = 'r1'");
            expect(query._unsafeUnwrap()).toBeDefined();
        });

        it('rolls back on error', () => {
            const result = service.transaction(() => {
                service.execute("INSERT INTO repos (id, name) VALUES ('r1', 'test')");
                return err(databaseError('intentional fail'));
            });

            expect(result.isErr()).toBe(true);

            // Verify data is NOT in database
            const query = service.queryOne<{ id: string }>("SELECT * FROM repos WHERE id = 'r1'");
            expect(query._unsafeUnwrap()).toBeUndefined();
        });
    });

    describe('save', () => {
        it('exports valid DB to file', async () => {
            const { mkdirSync } = await import('node:fs');
            mkdirSync(tmpDir, { recursive: true });

            service.execute("INSERT INTO repos (id, name) VALUES ('r1', 'saved-repo')");

            const result = service.save();
            expect(result.isOk()).toBe(true);

            expect(existsSync(tmpPath)).toBe(true);
            const buffer = readFileSync(tmpPath);
            expect(buffer.length).toBeGreaterThan(0);

            // Verify by loading the saved DB
            const SQL = await initSqlJs();
            const loadedDb = new SQL.Database(buffer);
            const rows = loadedDb.exec("SELECT name FROM repos WHERE id = 'r1'");
            expect(rows[0].values[0][0]).toBe('saved-repo');
            loadedDb.close();
        });
    });

    describe('close', () => {
        it('clears timer and saves', async () => {
            const { mkdirSync } = await import('node:fs');
            mkdirSync(tmpDir, { recursive: true });

            const result = service.close();
            expect(result.isOk()).toBe(true);
        });
    });

    describe('shutdown hooks', () => {
        it('registers and removes SIGINT/SIGTERM handlers', async () => {
            const dbResult = await initInMemoryDatabase();
            const db = dbResult._unsafeUnwrap();

            const initialSigint = process.listenerCount('SIGINT');
            const initialSigterm = process.listenerCount('SIGTERM');

            const svc = new DbService(db, tmpPath, {
                autoSave: false,
                shutdownHooks: true,
            });

            expect(process.listenerCount('SIGINT')).toBe(initialSigint + 1);
            expect(process.listenerCount('SIGTERM')).toBe(initialSigterm + 1);

            const { mkdirSync } = await import('node:fs');
            mkdirSync(tmpDir, { recursive: true });
            svc.close();

            expect(process.listenerCount('SIGINT')).toBe(initialSigint);
            expect(process.listenerCount('SIGTERM')).toBe(initialSigterm);
        });
    });
});
