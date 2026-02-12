declare module 'sql.js' {
    export type BindParams =
        | Record<string, number | string | Uint8Array | null>
        | (number | string | Uint8Array | null)[];

    export interface QueryExecResult {
        columns: string[];
        values: any[][];
    }

    export interface Statement {
        bind(params?: BindParams): boolean;
        step(): boolean;
        getAsObject(): Record<string, any>;
        free(): boolean;
        reset(): void;
    }

    export interface Database {
        run(sql: string, params?: BindParams): Database;
        exec(sql: string, params?: BindParams): QueryExecResult[];
        prepare(sql: string): Statement;
        export(): Uint8Array;
        close(): void;
        getRowsModified(): number;
    }

    export interface SqlJsStatic {
        Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
    }

    export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
