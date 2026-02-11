import type { SnapshotSummary } from './snapshot.js';

export type SseEvent =
  | { type: 'connected'; data: { session_id: string } }
  | { type: 'snapshot'; data: SnapshotSummary }
  | { type: 'comment-update'; data: { session_id: string; comment_id: string; action: 'created' | 'updated' | 'deleted' | 'sent' | 'resolved' } }
  | { type: 'watcher-status'; data: { session_id: string; is_watching: boolean } }
  | { type: 'heartbeat'; data: { timestamp: string } };
