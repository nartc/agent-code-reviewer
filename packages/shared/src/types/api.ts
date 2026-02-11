import type { Repo, RepoPath, RepoWithPaths } from './repo.js';
import type { Session } from './session.js';
import type { Snapshot, SnapshotSummary } from './snapshot.js';
import type { Comment, CommentStatus, CreateCommentInput, CommentThread } from './comment.js';
import type { Target, TransportType, TransportStatus } from './transport.js';

// --- Repos ---
export interface CreateRepoRequest { path: string }
export interface CreateRepoResponse { repo: Repo; repo_path: RepoPath; is_new: boolean }
export interface UpdateRepoRequest { base_branch?: string }
export interface ListReposResponse { repos: RepoWithPaths[] }

// --- Sessions ---
export interface CreateSessionRequest { repo_id: string; path: string }
export interface CreateSessionResponse { session: Session; snapshot: Snapshot }
export interface UpdateSessionRequest { base_branch?: string }
export interface ListSessionsResponse { sessions: Session[] }

// --- Snapshots ---
export interface ListSnapshotsParams { limit?: number; before?: string }
export interface ListSnapshotsResponse { snapshots: SnapshotSummary[] }
export interface SnapshotDiffResponse { snapshot: Snapshot }

// --- Comments ---
export interface ListCommentsParams { session_id: string; snapshot_id?: string; status?: CommentStatus }
export interface ListCommentsResponse { comments: CommentThread[] }
export interface CreateCommentRequest extends CreateCommentInput {}
export interface UpdateCommentRequest { content: string }
export interface SendCommentsRequest { comment_ids: string[]; target_id: string; transport_type: TransportType }
export interface SendCommentsResponse { comments: Comment[]; formatted_text?: string }
export interface ReplyToCommentRequest { content: string }

// --- Transport ---
export interface ListTargetsResponse { targets: Target[] }
export interface TransportStatusResponse { statuses: TransportStatus[] }
export interface TransportConfigResponse { active_transport: TransportType; last_target_id: string | null; settings: Record<string, unknown> | null }
export interface UpdateTransportConfigRequest { active_transport: TransportType; last_target_id?: string }

// --- Git ---
export interface GitInfoRequest { path: string }
export interface GitInfoResponse {
  is_git_repo: boolean;
  remote_url: string | null;
  current_branch: string;
  default_branch: string;
  repo_name: string;
}
export interface GitBranchesRequest { path: string }
export interface GitBranchesResponse { branches: string[] }
export interface GitScanParams { roots?: string; max_depth?: number }
export interface ScannedRepo {
  path: string;
  name: string;
  remote_url: string | null;
  current_branch: string;
  default_branch: string;
}
