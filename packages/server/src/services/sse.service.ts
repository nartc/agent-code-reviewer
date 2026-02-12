import type { SseEvent } from '@agent-code-reviewer/shared';

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface SseConnection {
	id: string;
	write: (event: SseEvent) => void;
}

export class SseService {
	private connections: Map<string, Set<SseConnection>> = new Map();
	private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

	addConnection(sessionId: string, connection: SseConnection): void {
		let sessionConnections = this.connections.get(sessionId);
		if (!sessionConnections) {
			sessionConnections = new Set();
			this.connections.set(sessionId, sessionConnections);
		}
		sessionConnections.add(connection);

		if (!this.heartbeatTimers.has(sessionId)) {
			const timer = setInterval(() => {
				this.broadcast(sessionId, {
					type: 'heartbeat',
					data: { timestamp: new Date().toISOString() },
				});
			}, HEARTBEAT_INTERVAL_MS);
			this.heartbeatTimers.set(sessionId, timer);
		}
	}

	removeConnection(sessionId: string, connectionId: string): void {
		const sessionConnections = this.connections.get(sessionId);
		if (!sessionConnections) return;

		for (const conn of sessionConnections) {
			if (conn.id === connectionId) {
				sessionConnections.delete(conn);
				break;
			}
		}

		if (sessionConnections.size === 0) {
			this.connections.delete(sessionId);
			const timer = this.heartbeatTimers.get(sessionId);
			if (timer) {
				clearInterval(timer);
				this.heartbeatTimers.delete(sessionId);
			}
		}
	}

	broadcast(sessionId: string, event: SseEvent): void {
		const sessionConnections = this.connections.get(sessionId);
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
			const sessionConnections = this.connections.get(sessionId);
			return sessionConnections ? sessionConnections.size : 0;
		}

		let total = 0;
		for (const connections of this.connections.values()) {
			total += connections.size;
		}
		return total;
	}

	shutdown(): void {
		for (const timer of this.heartbeatTimers.values()) {
			clearInterval(timer);
		}
		this.heartbeatTimers.clear();

		for (const connections of this.connections.values()) {
			connections.clear();
		}
		this.connections.clear();
	}
}
