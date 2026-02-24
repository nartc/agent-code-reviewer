import type { CommentPayload, Target } from '@agent-code-reviewer/shared';
import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectErr, expectOk } from '../../__tests__/helpers.js';
import { initInMemoryDatabase } from '../../db/client.js';
import type { Transport } from '../../transport/transport.interface.js';
import { DbService } from '../db.service.js';
import { TransportService } from '../transport.service.js';

function createMockTransport(type: 'tmux' | 'clipboard', overrides: Partial<Transport> = {}): Transport {
    return {
        type,
        isAvailable: vi.fn(() => okAsync(true)),
        listTargets: vi.fn(() => okAsync([])),
        sendComments: vi.fn(() => okAsync({ success: true })),
        getStatus: vi.fn(() => okAsync({ type, available: true })),
        ...overrides,
    } as unknown as Transport;
}

describe('TransportService', () => {
    let dbService: DbService;
    let service: TransportService;
    let tmux: Transport;
    let clipboard: Transport;

    beforeEach(async () => {
        const dbResult = await initInMemoryDatabase();
        const db = expectOk(dbResult);
        dbService = new DbService(db, ':memory:', { autoSave: false, shutdownHooks: false });

        tmux = createMockTransport('tmux', {
            listTargets: vi.fn(() =>
                okAsync([
                    { id: 'main:0.0', label: 'main:0.0 — vim', transport: 'tmux' },
                    { id: 'main:0.1', label: 'main:0.1 — zsh', transport: 'tmux' },
                    { id: 'work:1.0', label: 'work:1.0 — node', transport: 'tmux' },
                ] as Target[]),
            ),
        });

        clipboard = createMockTransport('clipboard', {
            listTargets: vi.fn(() =>
                okAsync([{ id: 'clipboard', label: 'Copy to Clipboard', transport: 'clipboard' }] as Target[]),
            ),
        });

        service = new TransportService([tmux, clipboard], dbService);
    });

    afterEach(() => {
        try {
            dbService.close();
        } catch {
            // ignore
        }
    });

    describe('listAllTargets', () => {
        it('combines targets from multiple transports', async () => {
            const result = await service.listAllTargets();
            const targets = expectOk(result);
            expect(targets).toHaveLength(4);
            expect(targets[0].id).toBe('main:0.0');
            expect(targets[3].id).toBe('clipboard');
        });

        it('skips erroring transports gracefully', async () => {
            const errorTmux = createMockTransport('tmux', {
                listTargets: vi.fn(() => errAsync({ type: 'TRANSPORT_ERROR' as const, message: 'tmux not running' })),
            });

            const svc = new TransportService([errorTmux, clipboard], dbService);
            const result = await svc.listAllTargets();
            const targets = expectOk(result);
            expect(targets).toHaveLength(1);
            expect(targets[0].id).toBe('clipboard');
        });
    });

    describe('send', () => {
        const payloads: CommentPayload[] = [
            {
                id: 'c1',
                file_path: 'src/app.ts',
                line_start: 10,
                line_end: null,
                side: 'new',
                content: 'Fix this',
                status: 'sent',
                author: 'user',
            },
        ];

        it('dispatches to correct transport', async () => {
            const result = await service.send('tmux', 'main:0.1', payloads);
            expect(result.isOk()).toBe(true);
            expect(tmux.sendComments).toHaveBeenCalledWith('main:0.1', payloads, undefined);
        });

        it('returns TransportUnavailableError for unknown type', async () => {
            const result = await service.send('mcp' as any, 'target', payloads);
            expect(result.isErr()).toBe(true);
            const error = expectErr(result);
            expect(error.type).toBe('TRANSPORT_UNAVAILABLE');
        });
    });

    describe('getActiveConfig', () => {
        it('returns default when no row exists', () => {
            const result = service.getActiveConfig();
            const config = expectOk(result);
            expect(config.active_transport).toBe('tmux');
            expect(config.last_target_id).toBeNull();
            expect(config.settings).toBeNull();
        });

        it('reads persisted config', () => {
            dbService.execute(
                `INSERT INTO transport_config (id, active_transport, last_target_id, updated_at)
                 VALUES ('default', 'clipboard', 'clipboard', datetime('now'))`,
            );

            const result = service.getActiveConfig();
            const config = expectOk(result);
            expect(config.active_transport).toBe('clipboard');
            expect(config.last_target_id).toBe('clipboard');
        });
    });

    describe('saveActiveConfig', () => {
        it('inserts new config', () => {
            const saveResult = service.saveActiveConfig('clipboard', 'clipboard');
            expectOk(saveResult);

            const config = expectOk(service.getActiveConfig());
            expect(config.active_transport).toBe('clipboard');
            expect(config.last_target_id).toBe('clipboard');
        });

        it('updates existing config (upsert, no duplicates)', () => {
            service.saveActiveConfig('tmux', 'main:0.0');
            service.saveActiveConfig('clipboard');

            const config = expectOk(service.getActiveConfig());
            expect(config.active_transport).toBe('clipboard');
            expect(config.last_target_id).toBeNull();

            const countResult = dbService.query<{ cnt: number }>('SELECT count(*) as cnt FROM transport_config');
            const rows = expectOk(countResult);
            expect(rows[0].cnt).toBe(1);
        });
    });

    describe('getAllStatus', () => {
        it('returns status from all transports', async () => {
            const result = await service.getAllStatus();
            const statuses = expectOk(result);
            expect(statuses).toHaveLength(2);
            expect(statuses[0]).toEqual({ type: 'tmux', available: true });
            expect(statuses[1]).toEqual({ type: 'clipboard', available: true });
        });
    });
});
