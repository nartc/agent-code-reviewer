import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TmuxTransport } from '../tmux.transport.js';

vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

function mockExecFile(
    impl: (cmd: string, args: string[], cb: (err: Error | null, stdout: string, stderr: string) => void) => void,
) {
    (execFile as unknown as Mock).mockImplementation(impl);
}

function mockExecFileSuccess(stdout = '') {
    mockExecFile((_cmd, _args, cb) => {
        const child = { stdin: { write: vi.fn(), end: vi.fn() } };
        queueMicrotask(() => cb(null, stdout, ''));
        return child;
    });
}

function mockExecFileSequence(results: Array<{ stdout?: string; error?: Error }>) {
    let callIdx = 0;
    (execFile as unknown as Mock).mockImplementation(
        (_cmd: string, _args: string[], cb: (err: Error | null, stdout: string, stderr: string) => void) => {
            const child = { stdin: { write: vi.fn(), end: vi.fn() } };
            const result = results[callIdx++] ?? { stdout: '' };
            queueMicrotask(() => {
                if (result.error) {
                    cb(result.error, '', '');
                } else {
                    cb(null, result.stdout ?? '', '');
                }
            });
            return child;
        },
    );
}

describe('TmuxTransport', () => {
    let transport: TmuxTransport;

    beforeEach(() => {
        transport = new TmuxTransport();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('type', () => {
        it('should be tmux', () => {
            expect(transport.type).toBe('tmux');
        });
    });

    describe('isAvailable', () => {
        it('returns true when tmux list-sessions succeeds', async () => {
            mockExecFileSuccess('session1: 1 windows');
            const result = await transport.isAvailable();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(true);
        });

        it('returns false when tmux list-sessions fails', async () => {
            mockExecFile((_cmd, _args, cb) => {
                const child = { stdin: { write: vi.fn(), end: vi.fn() } };
                queueMicrotask(() => cb(new Error('no server running'), '', ''));
                return child;
            });
            const result = await transport.isAvailable();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(false);
        });
    });

    describe('listTargets', () => {
        it('parses 3-line tmux output into Target objects', async () => {
            const tmuxOutput = ['main:0.0 ~/project vim', 'main:0.1 ~/project zsh', 'work:1.0 ~/other node'].join('\n');
            mockExecFileSuccess(tmuxOutput);

            const result = await transport.listTargets();
            expect(result.isOk()).toBe(true);
            const targets = result._unsafeUnwrap();
            expect(targets).toHaveLength(3);

            expect(targets[0]).toEqual({
                id: 'main:0.0',
                label: 'main:0.0 — vim',
                transport: 'tmux',
                metadata: { pane_title: '~/project', pane_current_command: 'vim' },
            });
            expect(targets[1]).toEqual({
                id: 'main:0.1',
                label: 'main:0.1 — zsh',
                transport: 'tmux',
                metadata: { pane_title: '~/project', pane_current_command: 'zsh' },
            });
            expect(targets[2]).toEqual({
                id: 'work:1.0',
                label: 'work:1.0 — node',
                transport: 'tmux',
                metadata: { pane_title: '~/other', pane_current_command: 'node' },
            });
        });

        it('returns TransportError when tmux fails', async () => {
            mockExecFile((_cmd, _args, cb) => {
                const child = { stdin: { write: vi.fn(), end: vi.fn() } };
                queueMicrotask(() => cb(new Error('tmux not found'), '', ''));
                return child;
            });

            const result = await transport.listTargets();
            expect(result.isErr()).toBe(true);
            const error = result._unsafeUnwrapErr();
            expect(error.type).toBe('TRANSPORT_ERROR');
        });
    });

    describe('sendComments', () => {
        const payloads = [
            {
                file_path: 'src/app.ts',
                line_start: 10,
                line_end: null,
                side: 'new' as const,
                content: 'Add error handling here',
                status: 'sent' as const,
                author: 'user' as const,
                thread_replies: [],
            },
        ];

        it('executes 4 tmux commands in order: load-buffer, paste-buffer, delete-buffer, send-keys', async () => {
            const calls: string[][] = [];
            (execFile as unknown as Mock).mockImplementation(
                (cmd: string, args: string[], cb: (err: Error | null, stdout: string, stderr: string) => void) => {
                    const child = { stdin: { write: vi.fn(), end: vi.fn() } };
                    calls.push([cmd, ...args]);
                    queueMicrotask(() => cb(null, '', ''));
                    return child;
                },
            );

            const result = await transport.sendComments('main:0.1', payloads);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual({ success: true });

            expect(calls).toHaveLength(4);
            expect(calls[0][1]).toBe('load-buffer');
            expect(calls[1][1]).toBe('paste-buffer');
            expect(calls[2][1]).toBe('delete-buffer');
            expect(calls[3][1]).toBe('send-keys');
        });

        it('pipes formatted text to stdin of load-buffer', async () => {
            const stdinWrites: string[] = [];
            (execFile as unknown as Mock).mockImplementation(
                (_cmd: string, _args: string[], cb: (err: Error | null, stdout: string, stderr: string) => void) => {
                    const child = {
                        stdin: {
                            write: vi.fn((data: string) => stdinWrites.push(data)),
                            end: vi.fn(),
                        },
                    };
                    queueMicrotask(() => cb(null, '', ''));
                    return child;
                },
            );

            await transport.sendComments('main:0.1', payloads);

            expect(stdinWrites.length).toBeGreaterThan(0);
            expect(stdinWrites[0]).toContain('Code Review Comments');
            expect(stdinWrites[0]).toContain('src/app.ts');
        });

        it('returns TransportError when paste-buffer fails (invalid pane)', async () => {
            mockExecFileSequence([{ stdout: '' }, { error: new Error("can't find pane: main:9.9") }]);

            const result = await transport.sendComments('main:9.9', payloads);
            expect(result.isErr()).toBe(true);
            const error = result._unsafeUnwrapErr();
            expect(error.type).toBe('TRANSPORT_ERROR');
            expect(error.message).toContain('paste-buffer');
        });

        it('continues even if delete-buffer fails', async () => {
            mockExecFileSequence([
                { stdout: '' },
                { stdout: '' },
                { error: new Error('buffer not found') },
                { stdout: '' },
            ]);

            const result = await transport.sendComments('main:0.1', payloads);
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual({ success: true });
        });
    });

    describe('getStatus', () => {
        it('returns available true when tmux is running', async () => {
            mockExecFileSuccess('session1: 1 windows');
            const result = await transport.getStatus();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual({ type: 'tmux', available: true });
        });

        it('returns available false when tmux is not running', async () => {
            mockExecFile((_cmd, _args, cb) => {
                const child = { stdin: { write: vi.fn(), end: vi.fn() } };
                queueMicrotask(() => cb(new Error('no server'), '', ''));
                return child;
            });
            const result = await transport.getStatus();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual({ type: 'tmux', available: false });
        });
    });
});
