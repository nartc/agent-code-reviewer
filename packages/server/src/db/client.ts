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
    const currentVersion = result.length > 0 ? result[0].values[0][0] : null;

    if (currentVersion === null) {
        // Fresh DB — schema.sql already ran above, just record version
        db.run("INSERT INTO app_config (key, value) VALUES ('schema_version', '1')");
    }
    // Future migrations would go here:
    // if (currentVersion === '1') { /* migrate to v2 */ }
}
