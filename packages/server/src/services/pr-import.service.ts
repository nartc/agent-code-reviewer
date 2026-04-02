import {
    type DatabaseError,
    type FileSummary,
    type ImportPrCommentsRequest,
    type ImportPrCommentsResponse,
    generateId,
} from '@agent-code-reviewer/shared';
import { type Result, err, ok } from 'neverthrow';
import { basename } from 'node:path';
import type { DbService } from './db.service.js';
import type { SseService } from './sse.service.js';
import { splitDiffByFile } from './watcher.service.js';

export class PrImportService {
    constructor(
        private db: DbService,
        private sse: SseService,
    ) {}

    importPr(input: ImportPrCommentsRequest): Result<ImportPrCommentsResponse, DatabaseError> {
        return this.db.transaction(() => {
            // 1. Repo — find or create
            const repoResult = this.db.queryOne<{ id: string }>('SELECT id FROM repos WHERE path = $path', {
                $path: input.repo_path,
            });
            if (repoResult.isErr()) return err(repoResult.error);

            let repoId: string;
            if (repoResult.value) {
                repoId = repoResult.value.id;
            } else {
                repoId = generateId();
                const insertRepo = this.db.execute(
                    `INSERT INTO repos (id, name, path, remote_url, base_branch)
                     VALUES ($id, $name, $path, NULL, $baseBranch)`,
                    {
                        $id: repoId,
                        $name: basename(input.repo_path),
                        $path: input.repo_path,
                        $baseBranch: input.base_branch,
                    },
                );
                if (insertRepo.isErr()) return err(insertRepo.error);
            }

            // 2. Session — find active by repo_id + branch, or create
            const existingSession = this.db.queryOne<{ id: string }>(
                "SELECT id FROM sessions WHERE repo_id = $repoId AND branch = $branch AND status = 'active'",
                { $repoId: repoId, $branch: input.branch },
            );
            if (existingSession.isErr()) return err(existingSession.error);

            let sessionId: string;
            if (existingSession.value) {
                sessionId = existingSession.value.id;
            } else {
                sessionId = generateId();
                const insertSession = this.db.execute(
                    `INSERT INTO sessions (id, repo_id, branch, base_branch)
                     VALUES ($id, $repoId, $branch, $baseBranch)`,
                    {
                        $id: sessionId,
                        $repoId: repoId,
                        $branch: input.branch,
                        $baseBranch: input.base_branch,
                    },
                );
                if (insertSession.isErr()) return err(insertSession.error);
            }

            // 3. Snapshot
            const snapshotId = generateId();
            const diffByFile = splitDiffByFile(input.raw_diff);
            const filesSummary: FileSummary[] = [...diffByFile.keys()].map((path) => ({
                path,
                additions: 0,
                deletions: 0,
                status: 'modified' as const,
            }));

            const insertSnapshot = this.db.execute(
                `INSERT INTO snapshots (id, session_id, raw_diff, files_summary, head_commit, trigger, changed_files, has_review_comments)
                 VALUES ($id, $sessionId, $rawDiff, $filesSummary, NULL, 'manual', NULL, 1)`,
                {
                    $id: snapshotId,
                    $sessionId: sessionId,
                    $rawDiff: input.raw_diff,
                    $filesSummary: JSON.stringify(filesSummary),
                },
            );
            if (insertSnapshot.isErr()) return err(insertSnapshot.error);

            // 4. Comments
            // Track github_id → local_id and github_id → root local_id for flat threading
            const ghIdToLocalId = new Map<number, string>();
            const ghIdToRootLocalId = new Map<number, string>();
            let importedCount = 0;

            for (const comment of input.comments) {
                const commentId = generateId();
                ghIdToLocalId.set(comment.id, commentId);

                const filePath = comment.path || '[general]';
                const lineVal = comment.line;
                const side = comment.side === 'LEFT' ? 'old' : comment.side === 'RIGHT' ? 'new' : null;
                const content = `**${comment.user.login}**: ${comment.body}`;

                // Always point reply_to_id at the root comment (flat threading)
                let replyToId: string | null = null;
                if (comment.in_reply_to_id) {
                    replyToId =
                        ghIdToRootLocalId.get(comment.in_reply_to_id) ??
                        ghIdToLocalId.get(comment.in_reply_to_id) ??
                        null;
                }
                // Track the root for this comment's thread
                ghIdToRootLocalId.set(comment.id, replyToId ?? commentId);

                const insertComment = this.db.execute(
                    `INSERT INTO comments (id, session_id, snapshot_id, reply_to_id, file_path, line_start, line_end, side, author, content, status, sent_at)
                     VALUES ($id, $sessionId, $snapshotId, $replyToId, $filePath, $lineStart, $lineEnd, $side, 'user', $content, 'sent', $sentAt)`,
                    {
                        $id: commentId,
                        $sessionId: sessionId,
                        $snapshotId: snapshotId,
                        $replyToId: replyToId,
                        $filePath: filePath,
                        $lineStart: lineVal,
                        $lineEnd: lineVal,
                        $side: side,
                        $content: content,
                        $sentAt: comment.created_at,
                    },
                );
                if (insertComment.isErr()) return err(insertComment.error);
                importedCount++;
            }

            // 5. Broadcast SSE
            const snapshotSummary = {
                id: snapshotId,
                session_id: sessionId,
                files_summary: filesSummary,
                head_commit: null,
                trigger: 'manual' as const,
                changed_files: null,
                has_review_comments: true,
                created_at: new Date().toISOString(),
            };
            this.sse.broadcast(sessionId, { type: 'snapshot', data: snapshotSummary });

            return ok({ session_id: sessionId, snapshot_id: snapshotId, imported_count: importedCount });
        });
    }
}
