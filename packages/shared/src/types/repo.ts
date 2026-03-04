export interface Repo {
    id: string;
    remote_url: string | null;
    name: string;
    path: string;
    base_branch: string;
    created_at: string;
}
