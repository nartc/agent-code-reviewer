import type { CommentSide, CommentStatus, CommentAuthor } from './comment.js';

export type TransportType = 'tmux' | 'mcp' | 'clipboard';

export interface Target {
  id: string;
  label: string;
  transport: TransportType;
  metadata?: Record<string, string>;
}

export interface CommentPayload {
  file_path: string;
  line_start: number | null;
  line_end: number | null;
  side: CommentSide | null;
  content: string;
  status: CommentStatus;
  author: CommentAuthor;
  thread_replies?: Array<{ content: string; author: CommentAuthor }>;
}

export interface TransportStatus {
  type: TransportType;
  available: boolean;
  error?: string;
}
