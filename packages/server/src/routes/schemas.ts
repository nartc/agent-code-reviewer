import { z } from 'zod';

// --- Enum schemas (reusable) ---

export const commentStatusSchema = z.enum(['draft', 'sent', 'resolved']);
export const commentSideSchema = z.enum(['old', 'new', 'both']);
export const commentAuthorSchema = z.enum(['user', 'agent']);
export const transportTypeSchema = z.enum(['tmux', 'mcp', 'clipboard']);

// --- Param schemas ---

export const idParamSchema = z.object({
    id: z.string().min(1),
});

// --- Repo schemas ---

export const createRepoSchema = z.object({
    path: z.string().min(1),
});

export const updateRepoSchema = z.object({
    base_branch: z.string().min(1).optional(),
});

// --- Session schemas ---

export const createSessionSchema = z.object({
    repo_id: z.string().min(1),
    path: z.string().min(1),
});

export const updateSessionSchema = z.object({
    base_branch: z.string().min(1).optional(),
});

// --- Comment schemas ---

export const createCommentSchema = z.object({
    session_id: z.string().min(1),
    snapshot_id: z.string().min(1),
    file_path: z.string().min(1),
    content: z.string().min(1),
    reply_to_id: z.string().optional(),
    line_start: z.number().optional(),
    line_end: z.number().optional(),
    side: commentSideSchema.optional(),
    author: commentAuthorSchema.optional(),
});

export const updateCommentSchema = z.object({
    content: z.string().min(1),
});

export const sendCommentsSchema = z.object({
    comment_ids: z.array(z.string()).min(1),
    target_id: z.string().min(1),
    transport_type: transportTypeSchema,
});

export const replyToCommentSchema = z.object({
    content: z.string().min(1),
});

// --- Snapshot query schemas ---

export const listSnapshotsQuerySchema = z.object({
    limit: z.string().optional(),
    before: z.string().optional(),
});

// --- Comment query schema ---

export const listCommentsQuerySchema = z.object({
    session_id: z.string().min(1),
    snapshot_id: z.string().optional(),
    status: commentStatusSchema.optional(),
});

// --- Git query schemas ---

export const gitInfoQuerySchema = z.object({
    path: z.string().min(1),
});

export const gitBranchesQuerySchema = z.object({
    path: z.string().min(1),
});

export const gitScanQuerySchema = z.object({
    roots: z.string().optional(),
    max_depth: z.string().optional(),
});

// --- Transport schemas ---

export const updateTransportConfigSchema = z.object({
    active_transport: transportTypeSchema,
    last_target_id: z.string().optional(),
});
