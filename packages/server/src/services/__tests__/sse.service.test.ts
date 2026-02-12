import { type SseEvent } from '@agent-code-reviewer/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SseConnection, SseService } from '../sse.service.js';

describe('SseService', () => {
	let service: SseService;

	beforeEach(() => {
		vi.useFakeTimers();
		service = new SseService();
	});

	afterEach(() => {
		service.shutdown();
		vi.useRealTimers();
	});

	describe('addConnection', () => {
		it('registers a connection (AC-1.1)', () => {
			const conn: SseConnection = { id: 'conn-1', write: vi.fn() };
			service.addConnection('sess-1', conn);

			expect(service.getConnectionCount('sess-1')).toBe(1);
		});

		it('starts heartbeat on first connection (AC-1.2)', () => {
			const conn: SseConnection = { id: 'conn-1', write: vi.fn() };
			service.addConnection('sess-1', conn);

			vi.advanceTimersByTime(30_000);

			expect(conn.write).toHaveBeenCalledTimes(1);
			const event = (conn.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as SseEvent;
			expect(event.type).toBe('heartbeat');
			expect((event.data as { timestamp: string }).timestamp).toBeDefined();
		});

		it('does NOT restart heartbeat on second connection (AC-1.3)', () => {
			const conn1: SseConnection = { id: 'conn-1', write: vi.fn() };
			const conn2: SseConnection = { id: 'conn-2', write: vi.fn() };

			service.addConnection('sess-1', conn1);
			service.addConnection('sess-1', conn2);

			vi.advanceTimersByTime(30_000);

			// Both connections should get exactly 1 heartbeat each
			expect(conn1.write).toHaveBeenCalledTimes(1);
			expect(conn2.write).toHaveBeenCalledTimes(1);
		});
	});

	describe('removeConnection', () => {
		it('removes from pool (AC-1.4)', () => {
			const conn: SseConnection = { id: 'conn-1', write: vi.fn() };
			service.addConnection('sess-1', conn);

			service.removeConnection('sess-1', 'conn-1');

			expect(service.getConnectionCount('sess-1')).toBe(0);
		});

		it('clears heartbeat on last connection (AC-1.5)', () => {
			const conn: SseConnection = { id: 'conn-1', write: vi.fn() };
			service.addConnection('sess-1', conn);

			service.removeConnection('sess-1', 'conn-1');
			vi.advanceTimersByTime(30_000);

			expect(conn.write).not.toHaveBeenCalled();
		});

		it('does NOT clear heartbeat if other connections remain (AC-1.6)', () => {
			const conn1: SseConnection = { id: 'conn-1', write: vi.fn() };
			const conn2: SseConnection = { id: 'conn-2', write: vi.fn() };

			service.addConnection('sess-1', conn1);
			service.addConnection('sess-1', conn2);

			service.removeConnection('sess-1', 'conn-1');
			vi.advanceTimersByTime(30_000);

			expect(conn2.write).toHaveBeenCalledTimes(1);
		});

		it('is no-op for non-existent sessionId', () => {
			expect(() => service.removeConnection('nonexistent', 'conn-1')).not.toThrow();
		});

		it('is no-op for non-existent connectionId', () => {
			const conn: SseConnection = { id: 'conn-1', write: vi.fn() };
			service.addConnection('sess-1', conn);

			expect(() => service.removeConnection('sess-1', 'nonexistent')).not.toThrow();
			expect(service.getConnectionCount('sess-1')).toBe(1);
		});
	});

	describe('broadcast', () => {
		it('delivers to all connections (AC-1.7)', () => {
			const write1 = vi.fn();
			const write2 = vi.fn();
			const write3 = vi.fn();

			service.addConnection('sess-1', { id: 'c1', write: write1 });
			service.addConnection('sess-1', { id: 'c2', write: write2 });
			service.addConnection('sess-1', { id: 'c3', write: write3 });

			const event: SseEvent = { type: 'connected', data: { session_id: 'sess-1' } };
			service.broadcast('sess-1', event);

			expect(write1).toHaveBeenCalledWith(event);
			expect(write2).toHaveBeenCalledWith(event);
			expect(write3).toHaveBeenCalledWith(event);
		});

		it('is no-op for non-existent session (AC-1.8)', () => {
			const event: SseEvent = { type: 'connected', data: { session_id: 'x' } };
			expect(() => service.broadcast('sess-x', event)).not.toThrow();
		});

		it('isolates sessions (AC-1.9)', () => {
			const write1 = vi.fn();
			const write2 = vi.fn();

			service.addConnection('sess-1', { id: 'c1', write: write1 });
			service.addConnection('sess-2', { id: 'c2', write: write2 });

			const event: SseEvent = { type: 'connected', data: { session_id: 'sess-1' } };
			service.broadcast('sess-1', event);

			expect(write1).toHaveBeenCalledWith(event);
			expect(write2).not.toHaveBeenCalled();
		});

		it('swallows individual write errors (AC-1.10)', () => {
			const write1 = vi.fn().mockImplementation(() => {
				throw new Error('write failed');
			});
			const write2 = vi.fn();

			service.addConnection('sess-1', { id: 'c1', write: write1 });
			service.addConnection('sess-1', { id: 'c2', write: write2 });

			const event: SseEvent = { type: 'connected', data: { session_id: 'sess-1' } };
			service.broadcast('sess-1', event);

			expect(write2).toHaveBeenCalledWith(event);
		});
	});

	describe('getConnectionCount', () => {
		it('returns total across all sessions when no sessionId (AC-1.11)', () => {
			service.addConnection('sess-1', { id: 'c1', write: vi.fn() });
			service.addConnection('sess-1', { id: 'c2', write: vi.fn() });
			service.addConnection('sess-2', { id: 'c3', write: vi.fn() });

			expect(service.getConnectionCount()).toBe(3);
		});

		it('returns 0 for session with no connections', () => {
			expect(service.getConnectionCount('sess-1')).toBe(0);
		});
	});

	describe('shutdown', () => {
		it('clears everything (AC-1.12)', () => {
			const write1 = vi.fn();
			const write2 = vi.fn();

			service.addConnection('sess-1', { id: 'c1', write: write1 });
			service.addConnection('sess-2', { id: 'c2', write: write2 });

			service.shutdown();

			expect(service.getConnectionCount()).toBe(0);

			vi.advanceTimersByTime(30_000);
			expect(write1).not.toHaveBeenCalled();
			expect(write2).not.toHaveBeenCalled();
		});
	});
});
