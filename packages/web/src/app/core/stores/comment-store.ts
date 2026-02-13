import { Injectable, inject } from '@angular/core';
import { signalState, patchState } from '@ngrx/signals';
import { computed } from '@angular/core';
import type {
    CommentThread,
    CreateCommentInput,
    UpdateCommentRequest,
    SendCommentsRequest,
    ReplyToCommentRequest,
    ListCommentsParams,
} from '@agent-code-reviewer/shared';
import { ApiClient } from '../services/api-client';

@Injectable({ providedIn: 'root' })
export class CommentStore {
    readonly #api = inject(ApiClient);

    readonly #state = signalState({
        comments: [] as CommentThread[],
        isLoading: false,
    });

    readonly comments = this.#state.comments;
    readonly isLoading = this.#state.isLoading;

    readonly draftComments = computed(() => this.comments().filter((t) => t.comment.status === 'draft'));
    readonly sentComments = computed(() => this.comments().filter((t) => t.comment.status === 'sent'));
    readonly resolvedComments = computed(() => this.comments().filter((t) => t.comment.status === 'resolved'));

    loadComments(params: ListCommentsParams): void {
        patchState(this.#state, { isLoading: true });
        this.#api.listComments(params).subscribe({
            next: ({ comments }) => {
                patchState(this.#state, { comments, isLoading: false });
            },
            error: () => {
                patchState(this.#state, { isLoading: false });
            },
        });
    }

    createComment(body: CreateCommentInput): void {
        this.#api.createComment(body).subscribe({
            next: ({ comment }) => {
                patchState(this.#state, (s) => ({
                    comments: [...s.comments, { comment, replies: [] }],
                }));
            },
        });
    }

    updateComment(id: string, body: UpdateCommentRequest): void {
        this.#api.updateComment(id, body).subscribe({
            next: ({ comment: updated }) => {
                patchState(this.#state, (s) => ({
                    comments: s.comments.map((t) => {
                        if (t.comment.id === id) {
                            return { ...t, comment: updated };
                        }
                        const replyIdx = t.replies.findIndex((r) => r.id === id);
                        if (replyIdx !== -1) {
                            const replies = [...t.replies];
                            replies[replyIdx] = updated;
                            return { ...t, replies };
                        }
                        return t;
                    }),
                }));
            },
        });
    }

    deleteComment(id: string): void {
        this.#api.deleteComment(id).subscribe({
            next: () => {
                patchState(this.#state, (s) => {
                    // Check if it's a parent comment
                    const isParent = s.comments.some((t) => t.comment.id === id);
                    if (isParent) {
                        return { comments: s.comments.filter((t) => t.comment.id !== id) };
                    }
                    // It's a reply
                    return {
                        comments: s.comments.map((t) => ({
                            ...t,
                            replies: t.replies.filter((r) => r.id !== id),
                        })),
                    };
                });
            },
        });
    }

    sendComments(body: SendCommentsRequest): void {
        this.#api.sendComments(body).subscribe({
            next: ({ comments: updated }) => {
                patchState(this.#state, (s) => ({
                    comments: s.comments.map((t) => {
                        const match = updated.find((c) => c.id === t.comment.id);
                        if (match) {
                            return { ...t, comment: match };
                        }
                        return t;
                    }),
                }));
            },
        });
    }

    resolveComment(id: string): void {
        this.#api.resolveComment(id).subscribe({
            next: ({ comment: updated }) => {
                patchState(this.#state, (s) => ({
                    comments: s.comments.map((t) => (t.comment.id === id ? { ...t, comment: updated } : t)),
                }));
            },
        });
    }

    createReply(commentId: string, body: ReplyToCommentRequest): void {
        this.#api.replyToComment(commentId, body).subscribe({
            next: ({ comment: reply }) => {
                patchState(this.#state, (s) => ({
                    comments: s.comments.map((t) =>
                        t.comment.id === commentId ? { ...t, replies: [...t.replies, reply] } : t,
                    ),
                }));
            },
        });
    }

    onSseCommentUpdate(sessionId: string): void {
        this.loadComments({ session_id: sessionId });
    }
}
