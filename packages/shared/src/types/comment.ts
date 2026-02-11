export type CommentStatus = 'draft' | 'sent' | 'resolved';
export type CommentSide = 'old' | 'new' | 'both';
export type CommentAuthor = 'user' | 'agent';

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

export interface CreateCommentInput {
  session_id: string;
  snapshot_id: string;
  reply_to_id?: string;
  file_path: string;
  line_start?: number;
  line_end?: number;
  side?: CommentSide;
  author?: CommentAuthor;
  content: string;
}

export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}
