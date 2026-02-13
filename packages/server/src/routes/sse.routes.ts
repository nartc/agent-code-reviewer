import type { SseEvent } from '@agent-code-reviewer/shared';
import { generateId } from '@agent-code-reviewer/shared';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SseConnection, SseService } from '../services/sse.service.js';

export function createSseRoutes(sseService: SseService): Hono {
    const app = new Hono();

    app.get('/sessions/:id', (c) => {
        const sessionId = c.req.param('id');

        return streamSSE(c, async (stream) => {
            const connectionId = generateId();
            const connection: SseConnection = {
                id: connectionId,
                write: (event: SseEvent) => {
                    stream.writeSSE({
                        data: JSON.stringify(event.data),
                        event: event.type,
                    });
                },
            };

            sseService.addConnection(sessionId, connection);

            stream.writeSSE({
                data: JSON.stringify({ session_id: sessionId }),
                event: 'connected',
            });

            stream.onAbort(() => {
                sseService.removeConnection(sessionId, connectionId);
            });

            while (!stream.aborted) {
                await stream.sleep(60_000);
            }
        });
    });

    return app;
}
