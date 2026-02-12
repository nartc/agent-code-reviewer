import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { TransportService } from '../services/transport.service.js';
import { resultToResponse, asyncResultToResponse } from '../lib/result-to-response.js';
import { updateTransportConfigSchema } from './schemas.js';

export function createTransportRoutes(transportService: TransportService): Hono {
    const app = new Hono();

    // GET /targets
    app.get('/targets', (c) => {
        return asyncResultToResponse(
            c,
            transportService.listAllTargets().map((targets) => ({ targets })),
        );
    });

    // GET /status
    app.get('/status', (c) => {
        return asyncResultToResponse(
            c,
            transportService.getAllStatus().map((statuses) => ({ statuses })),
        );
    });

    // GET /config
    app.get('/config', (c) => {
        return resultToResponse(c, transportService.getActiveConfig());
    });

    // PUT /config
    app.put('/config', zValidator('json', updateTransportConfigSchema), (c) => {
        const { active_transport, last_target_id } = c.req.valid('json');
        return resultToResponse(
            c,
            transportService.saveActiveConfig(active_transport, last_target_id).map(() => ({ message: 'Config saved' })),
        );
    });

    return app;
}
