export type AnnotationMeta =
    | { type: 'indicator'; count: number; commentIds: string[]; hasMultiLine: boolean }
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
