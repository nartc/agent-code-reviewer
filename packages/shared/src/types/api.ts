import { z } from 'zod';
import type { Comment, CommentThread } from './comment.js';
import { commentStatusSchema } from './comment.js';
import type { Repo, RepoPath, RepoWithPaths } from './repo.js';
import type { Session } from './session.js';
import type { Snapshot, SnapshotSummary } from './snapshot.js';
import type { Target, TransportStatus, TransportType } from './transport.js';
import { transportTypeSchema } from './transport.js';

// --- Repo schemas ---
export const createRepoSchema = z.object({
    path: z.string().min(1),
});
export const updateRepoSchema = z.object({
    base_branch: z.string().min(1).optional(),
});

// --- Repos ---
export type CreateRepoRequest = z.infer<typeof createRepoSchema>;
export interface CreateRepoResponse {
    repo: Repo;
    repo_path: RepoPath;
    is_new: boolean;
}
export type UpdateRepoRequest = z.infer<typeof updateRepoSchema>;
export interface ListReposResponse {
    repos: RepoWithPaths[];
}

// --- Session schemas ---
export const createSessionSchema = z.object({
    repo_id: z.string().min(1),
    path: z.string().min(1),
});
export const updateSessionSchema = z.object({
    base_branch: z.string().min(1).optional(),
});

// --- Sessions ---
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;
export interface CreateSessionResponse {
    session: Session;
    snapshot: Snapshot;
}
export type UpdateSessionRequest = z.infer<typeof updateSessionSchema>;
export interface ListSessionsResponse {
    sessions: Session[];
}

// --- Snapshot query schemas ---
export const listSnapshotsQuerySchema = z.object({
    limit: z.string().optional(),
    before: z.string().optional(),
});

// --- Snapshots ---
export type ListSnapshotsParams = z.infer<typeof listSnapshotsQuerySchema>;
export interface ListSnapshotsResponse {
    snapshots: SnapshotSummary[];
}
export interface SnapshotDiffResponse {
    snapshot: Snapshot;
}

// --- Comment schemas ---
export const updateCommentSchema = z.object({
    content: z.string().min(1),
});
export const sendCommentsSchema = z.object({
    comment_ids: z.array(z.string()).min(1),
    target_id: z.string().min(1),
    transport_type: transportTypeSchema,
    snapshot_id: z.string().optional(),
});
export const replyToCommentSchema = z.object({
    content: z.string().min(1),
});
export const listCommentsQuerySchema = z.object({
    session_id: z.string().min(1),
    snapshot_id: z.string().optional(),
    status: commentStatusSchema.optional(),
});

// --- Comments ---
export type ListCommentsParams = z.infer<typeof listCommentsQuerySchema>;
export interface ListCommentsResponse {
    comments: CommentThread[];
}
export type UpdateCommentRequest = z.infer<typeof updateCommentSchema>;
export type SendCommentsRequest = z.infer<typeof sendCommentsSchema>;
export interface SendCommentsResponse {
    comments: Comment[];
    formatted_text?: string;
}
export type ReplyToCommentRequest = z.infer<typeof replyToCommentSchema>;

// --- Transport schemas ---
export const updateTransportConfigSchema = z.object({
    active_transport: transportTypeSchema,
    last_target_id: z.string().optional(),
});

// --- Transport ---
export interface ListTargetsResponse {
    targets: Target[];
}
export interface TransportStatusResponse {
    statuses: TransportStatus[];
}
export interface TransportConfigResponse {
    active_transport: TransportType;
    last_target_id: string | null;
    settings: Record<string, unknown> | null;
}
export type UpdateTransportConfigRequest = z.infer<typeof updateTransportConfigSchema>;

// --- Git schemas ---
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

// --- Git ---
export type GitInfoRequest = z.infer<typeof gitInfoQuerySchema>;
export interface GitInfoResponse {
    is_git_repo: boolean;
    remote_url: string | null;
    current_branch: string;
    default_branch: string;
    repo_name: string;
}
export type GitBranchesRequest = z.infer<typeof gitBranchesQuerySchema>;
export interface GitBranchesResponse {
    branches: string[];
}
export type GitScanParams = z.infer<typeof gitScanQuerySchema>;
export interface ScannedRepo {
    path: string;
    name: string;
    remote_url: string | null;
    current_branch: string;
    default_branch: string;
}
