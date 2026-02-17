export type AnnotationMeta =
    | { type: 'indicator'; count: number; commentIds: string[] }
    | {
          type: 'form';
          filePath: string;
          lineStart: number;
          side: 'old' | 'new' | 'both';
          snapshotId: string;
          sessionId: string;
      };
