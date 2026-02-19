import type { CommentThread } from '@agent-code-reviewer/shared';

export type AnnotationMeta =
    | { type: 'comment'; thread: CommentThread }
    | {
          type: 'form';
          filePath: string;
          lineStart: number;
          lineEnd?: number;
          isFileLevel?: boolean;
          side: 'old' | 'new' | 'both';
          snapshotId: string;
          sessionId: string;
      };
