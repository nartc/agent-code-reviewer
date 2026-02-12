import type { SseEvent } from '@agent-code-reviewer/shared';

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface SseConnection {
    id: string;
    write: (event: SseEvent) => void;
}

export class SseService {
    private connections: Record<string, Set<SseConnection>> = {};
    private heartbeatTimers: Record<string, NodeJS.Timeout> = {};

    addConnection(sessionId: string, connection: SseConnection): void {
        let sessionConnections = this.connections[sessionId];
        if (!sessionConnections) {
            sessionConnections = new Set();
            this.connections[sessionId] = sessionConnections;
        }
        sessionConnections.add(connection);

        if (this.heartbeatTimers[sessionId] === undefined) {
            const timer = setInterval(() => {
                this.broadcast(sessionId, {
                    type: 'heartbeat',
                    data: { timestamp: new Date().toISOString() },
                });
            }, HEARTBEAT_INTERVAL_MS);
            this.heartbeatTimers[sessionId] = timer;
        }
    }

    removeConnection(sessionId: string, connectionId: string): void {
        const sessionConnections = this.connections[sessionId];
        if (!sessionConnections) return;

        for (const conn of sessionConnections) {
            if (conn.id === connectionId) {
                sessionConnections.delete(conn);
                break;
            }
        }

        if (sessionConnections.size === 0) {
            delete this.connections[sessionId];
            const timer = this.heartbeatTimers[sessionId];
            if (timer) {
                clearInterval(timer);
                delete this.heartbeatTimers[sessionId];
            }
        }
    }

    broadcast(sessionId: string, event: SseEvent): void {
        const sessionConnections = this.connections[sessionId];
        if (!sessionConnections) return;

        for (const conn of sessionConnections) {
            try {
                conn.write(event);
            } catch {
                // Silently ignore individual write errors
            }
        }
    }

    getConnectionCount(sessionId?: string): number {
        if (sessionId !== undefined) {
            const sessionConnections = this.connections[sessionId];
            return sessionConnections ? sessionConnections.size : 0;
        }

        let total = 0;
        for (const connections of Object.values(this.connections)) {
            total += connections.size;
        }
        return total;
    }

    shutdown(): void {
        for (const timer of Object.values(this.heartbeatTimers)) {
            clearInterval(timer);
        }
        this.heartbeatTimers = {};

        for (const connections of Object.values(this.connections)) {
            connections.clear();
        }
        this.connections = {};
    }
}
