import { databaseError } from '@agent-code-reviewer/shared';
import { type Result, err, ok } from 'neverthrow';
import { existsSync, readFileSync } from 'node:fs';
import initSqlJs, { type Database } from 'sql.js';

export type { Database } from 'sql.js';

export async function initMcpDatabase(dbPath: string): Promise<Result<Database, { type: 'DATABASE_ERROR'; message: string; cause?: unknown }>> {
    try {
        if (!existsSync(dbPath)) {
            return err(databaseError(`Database file not found: ${dbPath}`));
        }

        const SQL = await initSqlJs();
        const buffer = readFileSync(dbPath);
        const db = new SQL.Database(buffer);
        return ok(db);
    } catch (e) {
        return err(
            databaseError(
                `Failed to open database at ${dbPath}: ${e instanceof Error ? e.message : String(e)}`,
                e,
            ),
        );
    }
}
