import type { Comment, CommentThread } from '@agent-code-reviewer/shared';

interface ErrorBody {
    error?: { message?: string };
}

export class ApiClient {
    constructor(private baseUrl: string) {}

    async getUnresolvedComments(params: {
        repo_path?: string;
        repo_name?: string;
        snapshot_id?: string;
    }): Promise<{ threads: CommentThread[]; repo_name: string }> {
        const url = new URL('/api/mcp/comments', this.baseUrl);
        if (params.repo_path) url.searchParams.set('repo_path', params.repo_path);
        if (params.repo_name) url.searchParams.set('repo_name', params.repo_name);
        if (params.snapshot_id) url.searchParams.set('snapshot_id', params.snapshot_id);

        const res = await fetch(url);
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ErrorBody;
            throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ threads: CommentThread[]; repo_name: string }>;
    }

    async getCommentThread(id: string): Promise<{ thread: CommentThread }> {
        const res = await fetch(new URL(`/api/mcp/comments/${id}`, this.baseUrl));
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ErrorBody;
            throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ thread: CommentThread }>;
    }

    async createReply(commentId: string, content: string): Promise<Comment> {
        const res = await fetch(new URL(`/api/mcp/comments/${commentId}/reply`, this.baseUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ErrorBody;
            throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<Comment>;
    }

    async resolveComment(commentId: string): Promise<Comment> {
        const res = await fetch(new URL(`/api/mcp/comments/${commentId}/resolve`, this.baseUrl), {
            method: 'POST',
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ErrorBody;
            throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<Comment>;
    }
}
