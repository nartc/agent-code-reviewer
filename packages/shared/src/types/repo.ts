export interface Repo {
    id: string;
    remote_url: string | null;
    name: string;
    base_branch: string;
    created_at: string;
}

export interface RepoPath {
    id: string;
    repo_id: string;
    path: string;
    last_accessed_at: string | null;
    created_at: string;
}

export interface RepoWithPaths extends Repo {
    paths: RepoPath[];
}
