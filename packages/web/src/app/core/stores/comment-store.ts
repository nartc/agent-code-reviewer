import type {
    CommentThread,
    CreateCommentInput,
    ListCommentsParams,
    ReplyToCommentRequest,
    SendCommentsRequest,
    UpdateCommentRequest,
} from '@agent-code-reviewer/shared';
import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ApiClient } from '../services/api-client';

@Injectable({ providedIn: 'root' })
export class CommentStore {
    readonly #api = inject(ApiClient);

    readonly #commentParams = signal<ListCommentsParams | undefined>(undefined);

    readonly #commentsResource = rxResource<CommentThread[], ListCommentsParams | undefined>({
        params: () => this.#commentParams(),
        stream: ({ params }) => this.#api.listComments(params).pipe(map((r) => r.comments)),
        defaultValue: [],
    });

    readonly comments = this.#commentsResource.value;
    readonly isLoading = this.#commentsResource.isLoading;

    readonly draftComments = computed(() => this.comments().filter((t) => t.comment.status === 'draft'));
    readonly sentComments = computed(() => this.comments().filter((t) => t.comment.status === 'sent'));
    readonly resolvedComments = computed(() => this.comments().filter((t) => t.comment.status === 'resolved'));

    loadComments(params: ListCommentsParams): void {
        this.#commentParams.set(params);
    }

    createComment(body: CreateCommentInput): void {
        this.#api.createComment(body).subscribe({
            next: ({ comment }) => {
                this.#commentsResource.update((comments) => [...comments, { comment, replies: [] }]);
            },
        });
    }

    updateComment(id: string, body: UpdateCommentRequest): void {
        this.#api.updateComment(id, body).subscribe({
            next: ({ comment: updated }) => {
                this.#commentsResource.update((comments) =>
                    comments.map((t) => {
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
                );
            },
        });
    }

    deleteComment(id: string): void {
        this.#api.deleteComment(id).subscribe({
            next: () => {
                this.#commentsResource.update((comments) => {
                    const isParent = comments.some((t) => t.comment.id === id);
                    if (isParent) {
                        return comments.filter((t) => t.comment.id !== id);
                    }
                    return comments.map((t) => ({
                        ...t,
                        replies: t.replies.filter((r) => r.id !== id),
                    }));
                });
            },
        });
    }

    sendComments(body: SendCommentsRequest): void {
        this.#api.sendComments(body).subscribe({
            next: ({ comments: updated }) => {
                this.#commentsResource.update((comments) =>
                    comments.map((t) => {
                        const match = updated.find((c) => c.id === t.comment.id);
                        if (match) {
                            return { ...t, comment: match };
                        }
                        return t;
                    }),
                );
            },
        });
    }

    resolveComment(id: string): void {
        this.#api.resolveComment(id).subscribe({
            next: ({ comment: updated }) => {
                this.#commentsResource.update((comments) =>
                    comments.map((t) => (t.comment.id === id ? { ...t, comment: updated } : t)),
                );
            },
        });
    }

    createReply(commentId: string, body: ReplyToCommentRequest): void {
        this.#api.replyToComment(commentId, body).subscribe({
            next: ({ comment: reply }) => {
                this.#commentsResource.update((comments) =>
                    comments.map((t) => (t.comment.id === commentId ? { ...t, replies: [...t.replies, reply] } : t)),
                );
            },
        });
    }

    onSseCommentUpdate(sessionId: string): void {
        this.loadComments({ session_id: sessionId });
    }
}
