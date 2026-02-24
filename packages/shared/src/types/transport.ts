import { z } from 'zod';
import type { CommentAuthor, CommentSide, CommentStatus } from './comment.js';

export const transportTypeSchema = z.enum(['tmux', 'mcp', 'clipboard']);

export type TransportType = z.infer<typeof transportTypeSchema>;

export interface Target {
    id: string;
    label: string;
    transport: TransportType;
    metadata?: Record<string, string>;
}

export interface CommentPayload {
    id: string;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    side: CommentSide | null;
    content: string;
    status: CommentStatus;
    author: CommentAuthor;
    thread_replies?: Array<{ id: string; content: string; author: CommentAuthor }>;
}

export const SUPPORTED_AGENT_HARNESSES = {
    claude: 'Claude Code',
    opencode: 'OpenCode',
} as const;

export type AgentHarness = keyof typeof SUPPORTED_AGENT_HARNESSES;

export interface TransportStatus {
    type: TransportType;
    available: boolean;
    error?: string;
}
