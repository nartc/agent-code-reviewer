import { type DatabaseError, databaseError } from '@agent-code-reviewer/shared';
import { err, ok, type Result } from 'neverthrow';
import { writeFileSync } from 'node:fs';
import type { BindParams, Database } from 'sql.js';

export class DbService {
    private saveTimer: NodeJS.Timeout | null = null;
    private shutdownHandlers: (() => void)[] = [];

    constructor(
        private db: Database,
        private dbPath: string,
        options: { autoSave?: boolean; shutdownHooks?: boolean } = {},
    ) {
        const { autoSave = true, shutdownHooks = true } = options;
        if (autoSave) {
            this.startAutoSave();
        }
        if (shutdownHooks) {
            this.registerShutdownHooks();
        }
    }

    /**
     * Execute a SELECT query and return all matching rows as typed objects.
     * Statement is prepared, bound, stepped through, and freed within this call.
     */
    query<T>(sql: string, params?: BindParams): Result<T[], DatabaseError> {
        try {
            const stmt = this.db.prepare(sql);
            if (params) stmt.bind(params);

            const rows: T[] = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject() as T);
            }
            stmt.free();
            return ok(rows);
        } catch (e) {
            return err(databaseError(`Query failed: ${e instanceof Error ? e.message : String(e)}`, e));
        }
    }

    /**
     * Execute a SELECT query and return the first matching row, or undefined.
     */
    queryOne<T>(sql: string, params?: BindParams): Result<T | undefined, DatabaseError> {
        try {
            const stmt = this.db.prepare(sql);
            if (params) stmt.bind(params);

            let row: T | undefined;
            if (stmt.step()) {
                row = stmt.getAsObject() as T;
            }
            stmt.free();
            return ok(row);
        } catch (e) {
            return err(databaseError(`QueryOne failed: ${e instanceof Error ? e.message : String(e)}`, e));
        }
    }

    /**
     * Execute an INSERT/UPDATE/DELETE statement and return the number of rows modified.
     */
    execute(sql: string, params?: BindParams): Result<{ changes: number }, DatabaseError> {
        try {
            this.db.run(sql, params as any);
            return ok({ changes: this.db.getRowsModified() });
        } catch (e) {
            return err(databaseError(`Execute failed: ${e instanceof Error ? e.message : String(e)}`, e));
        }
    }

    /**
     * Execute a function within a transaction.
     * BEGIN → fn() → COMMIT on ok / ROLLBACK on err.
     */
    transaction<T>(fn: () => Result<T, DatabaseError>): Result<T, DatabaseError> {
        try {
            this.db.run('BEGIN');
        } catch (e) {
            return err(databaseError(`Transaction BEGIN failed: ${e instanceof Error ? e.message : String(e)}`, e));
        }

        const result = fn();

        if (result.isOk()) {
            try {
                this.db.run('COMMIT');
            } catch (e) {
                try {
                    this.db.run('ROLLBACK');
                } catch {
                    // ignore rollback failure
                }
                return err(
                    databaseError(`Transaction COMMIT failed: ${e instanceof Error ? e.message : String(e)}`, e),
                );
            }
            return result;
        } else {
            try {
                this.db.run('ROLLBACK');
            } catch {
                // ignore rollback failure
            }
            return result;
        }
    }

    /**
     * Export the database to the configured file path.
     * WARNING: db.export() frees all open prepared statements.
     * Ensure no statements are held open when calling save().
     */
    save(): Result<void, DatabaseError> {
        if (this.dbPath === ':memory:') return ok(undefined);
        try {
            const data = this.db.export();
            writeFileSync(this.dbPath, Buffer.from(data));
            return ok(undefined);
        } catch (e) {
            return err(databaseError(`Save failed: ${e instanceof Error ? e.message : String(e)}`, e));
        }
    }

    /**
     * Clear auto-save timer, save, and close the database.
     */
    close(): Result<void, DatabaseError> {
        this.clearAutoSave();
        this.removeShutdownHooks();

        const saveResult = this.save();
        if (saveResult.isErr()) return saveResult;

        try {
            this.db.close();
            return ok(undefined);
        } catch (e) {
            return err(databaseError(`Close failed: ${e instanceof Error ? e.message : String(e)}`, e));
        }
    }

    private startAutoSave(): void {
        this.saveTimer = setInterval(() => {
            this.save();
        }, 5000);
        // Unref so the timer doesn't keep the process alive
        this.saveTimer.unref();
    }

    private clearAutoSave(): void {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }

    private registerShutdownHooks(): void {
        const handler = () => {
            this.close();
            process.exit(0);
        };
        this.shutdownHandlers.push(handler);
        process.on('SIGINT', handler);
        process.on('SIGTERM', handler);
    }

    private removeShutdownHooks(): void {
        for (const handler of this.shutdownHandlers) {
            process.removeListener('SIGINT', handler);
            process.removeListener('SIGTERM', handler);
        }
        this.shutdownHandlers = [];
    }
}
