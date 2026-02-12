export type SnapshotTrigger = 'manual' | 'fs_watch' | 'initial';

export interface FileSummary {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
}

export interface Snapshot {
    id: string;
    session_id: string;
    raw_diff: string;
    files_summary: FileSummary[];
    head_commit: string | null;
    trigger: SnapshotTrigger;
    changed_files: string[] | null;
    has_review_comments: boolean;
    created_at: string;
}

export type SnapshotSummary = Omit<Snapshot, 'raw_diff'>;
