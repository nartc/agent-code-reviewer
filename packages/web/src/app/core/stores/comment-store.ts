import type {
    Comment,
    CommentThread,
    CreateCommentInput,
    ListCommentsParams,
    ReplyToCommentRequest,
    SendCommentsRequest,
    SendCommentsResponse,
    UpdateCommentRequest,
} from '@agent-code-reviewer/shared';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiClient } from '../services/api-client';

@Injectable({ providedIn: 'root' })
export class CommentStore {
    readonly #api = inject(ApiClient);

    readonly #comments = signal<CommentThread[]>([]);
    readonly #isLoading = signal(false);

    readonly comments = this.#comments.asReadonly();
    readonly isLoading = this.#isLoading.asReadonly();

    readonly draftComments = computed(() => this.comments().filter((t) => t.comment.status === 'draft'));
    readonly sentComments = computed(() => this.comments().filter((t) => t.comment.status === 'sent'));
    readonly resolvedComments = computed(() => this.comments().filter((t) => t.comment.status === 'resolved'));

    loadComments(params: ListCommentsParams): void {
        this.#isLoading.set(true);
        this.#api.listComments(params).subscribe({
            next: (res) => {
                this.#comments.set(res.comments);
                this.#isLoading.set(false);
            },
            error: () => {
                this.#isLoading.set(false);
            },
        });
    }

    createComment(body: CreateCommentInput, onCreated?: (comment: Comment) => void): void {
        this.#api.createComment(body).subscribe({
            next: (comment) => {
                this.#comments.update((comments) => [...comments, { comment, replies: [] }]);
                onCreated?.(comment);
            },
        });
    }

    updateComment(id: string, body: UpdateCommentRequest): void {
        this.#api.updateComment(id, body).subscribe({
            next: (updated) => {
                this.#comments.update((comments) =>
                    comments.map((t) => {
                        if (t.comment.id === id) {
                            return { ...t, comment: updated };
                        }
                        const replyIdx = t.replies.findIndex((r: Comment) => r.id === id);
                        if (replyIdx !== -1) {
                            const replies = [...t.replies];
                            replies[replyIdx] = updated;
                            return { ...t, replies };
                        }
                        return t;
                    }),
                );
            },
        });
    }

    deleteComment(id: string): void {
        this.#api.deleteComment(id).subscribe({
            next: () => {
                this.#comments.update((comments) => {
                    const isParent = comments.some((t) => t.comment.id === id);
                    if (isParent) {
                        return comments.filter((t) => t.comment.id !== id);
                    }
                    return comments.map((t) => ({
                        ...t,
                        replies: t.replies.filter((r: Comment) => r.id !== id),
                    }));
                });
            },
        });
    }

    sendComments(
        body: SendCommentsRequest,
        callbacks?: { onSuccess?: (res: SendCommentsResponse) => void; onError?: (err: unknown) => void },
    ): void {
        this.#api.sendComments(body).subscribe({
            next: (res) => {
                this.#comments.update((comments) =>
                    comments.map((t) => {
                        const match = res.comments.find((c: Comment) => c.id === t.comment.id);
                        if (match) {
                            return { ...t, comment: match };
                        }
                        return t;
                    }),
                );
                callbacks?.onSuccess?.(res);
            },
            error: (err) => callbacks?.onError?.(err),
        });
    }

    resolveComment(id: string): void {
        this.#api.resolveComment(id).subscribe({
            next: (updated) => {
                this.#comments.update((comments) =>
                    comments.map((t) => (t.comment.id === id ? { ...t, comment: updated } : t)),
                );
            },
        });
    }

    createReply(commentId: string, body: ReplyToCommentRequest): void {
        this.#api.replyToComment(commentId, body).subscribe({
            next: (reply) => {
                this.#comments.update((comments) =>
                    comments.map((t) => (t.comment.id === commentId ? { ...t, replies: [...t.replies, reply] } : t)),
                );
            },
        });
    }

    bulkResolve(params: { session_id: string; snapshot_id?: string; comment_ids?: string[] }): void {
        this.#api.bulkResolveComments(params).subscribe({
            next: () => {
                this.loadComments({ session_id: params.session_id });
            },
        });
    }

    // Resolve flow: primary path is agent resolving via MCP mark_resolved tool.
    // Fallback: user resolves via UI button or bulk resolve on history page.
    // SSE comment-update events trigger a full reload to pick up agent replies/resolutions.
    onSseCommentUpdate(sessionId: string): void {
        this.loadComments({ session_id: sessionId });
    }
}
