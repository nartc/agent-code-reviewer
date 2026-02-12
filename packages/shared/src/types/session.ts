import type { Repo, RepoPath } from './repo.js';

export interface Session {
    id: string;
    repo_id: string;
    branch: string;
    base_branch: string | null;
    is_watching: boolean;
    created_at: string;
}

export interface SessionWithRepo extends Session {
    repo: Repo;
    repo_path: RepoPath;
}
