import { z } from 'zod';

export const commentStatusSchema = z.enum(['draft', 'sent', 'resolved']);
export const commentSideSchema = z.enum(['old', 'new', 'both']);
export const commentAuthorSchema = z.enum(['user', 'agent']);

export type CommentStatus = z.infer<typeof commentStatusSchema>;
export type CommentSide = z.infer<typeof commentSideSchema>;
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

export interface Comment {
    id: string;
    session_id: string;
    snapshot_id: string;
    reply_to_id: string | null;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    side: CommentSide | null;
    author: CommentAuthor;
    content: string;
    status: CommentStatus;
    created_at: string;
    sent_at: string | null;
    resolved_at: string | null;
}

export const createCommentSchema = z.object({
    session_id: z.string().min(1),
    snapshot_id: z.string().min(1),
    file_path: z.string().min(1),
    content: z.string().min(1),
    reply_to_id: z.string().optional(),
    line_start: z.number().optional(),
    line_end: z.number().optional(),
    side: commentSideSchema.optional(),
    author: commentAuthorSchema.optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export interface CommentThread {
    comment: Comment;
    replies: Comment[];
}
