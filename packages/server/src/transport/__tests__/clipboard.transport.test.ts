import { formatCommentsForTransport } from '@agent-code-reviewer/shared';
import { describe, expect, it } from 'vitest';
import { ClipboardTransport } from '../clipboard.transport.js';

describe('ClipboardTransport', () => {
    const transport = new ClipboardTransport();

    describe('type', () => {
        it('should be clipboard', () => {
            expect(transport.type).toBe('clipboard');
        });
    });

    describe('isAvailable', () => {
        it('always returns true', async () => {
            const result = await transport.isAvailable();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toBe(true);
        });
    });

    describe('listTargets', () => {
        it('returns single clipboard target', async () => {
            const result = await transport.listTargets();
            expect(result.isOk()).toBe(true);
            const targets = result._unsafeUnwrap();
            expect(targets).toHaveLength(1);
            expect(targets[0]).toEqual({
                id: 'clipboard',
                label: 'Copy to Clipboard',
                transport: 'clipboard',
            });
        });
    });

    describe('sendComments', () => {
        it('returns formatted text matching formatCommentsForTransport output', async () => {
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
                {
                    file_path: 'src/utils.ts',
                    line_start: 5,
                    line_end: 8,
                    side: null,
                    content: 'This function should be pure',
                    status: 'sent' as const,
                    author: 'user' as const,
                },
            ];

            const result = await transport.sendComments('clipboard', payloads);
            expect(result.isOk()).toBe(true);
            const sendResult = result._unsafeUnwrap();
            expect(sendResult.success).toBe(true);
            expect(sendResult.formatted_text).toBe(formatCommentsForTransport(payloads));
        });

        it('accepts any targetId', async () => {
            const payloads = [
                {
                    file_path: 'test.ts',
                    line_start: 1,
                    line_end: null,
                    side: null,
                    content: 'test',
                    status: 'sent' as const,
                    author: 'user' as const,
                },
            ];

            const result = await transport.sendComments('anything', payloads);
            expect(result.isOk()).toBe(true);
        });
    });

    describe('getStatus', () => {
        it('returns available true', async () => {
            const result = await transport.getStatus();
            expect(result.isOk()).toBe(true);
            expect(result._unsafeUnwrap()).toEqual({ type: 'clipboard', available: true });
        });
    });
});
