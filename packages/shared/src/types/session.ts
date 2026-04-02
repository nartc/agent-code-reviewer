import type { Repo } from './repo.js';

export type SessionStatus = 'active' | 'completed';

export interface Session {
    id: string;
    repo_id: string;
    branch: string;
    base_branch: string | null;
    status: SessionStatus;
    completed_at: string | null;
    completion_reason: string | null;
    is_watching: boolean;
    created_at: string;
}

export interface SessionWithRepo extends Session {
    repo: Repo;
}
