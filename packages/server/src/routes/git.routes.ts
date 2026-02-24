import { gitBranchesQuerySchema, gitInfoQuerySchema, gitScanQuerySchema } from '@agent-code-reviewer/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { basename } from 'node:path';
import type { AppConfig } from '../lib/config.js';
import { asyncResultToResponse } from '../lib/result-to-response.js';
import type { GitService } from '../services/git.service.js';

export function createGitRoutes(gitService: GitService, config: AppConfig): Hono {
    const app = new Hono();

    // GET /info?path=...
    app.get('/info', zValidator('query', gitInfoQuerySchema), (c) => {
        const { path } = c.req.valid('query');
        return asyncResultToResponse(
            c,
            gitService.getInfo(path).map((info) => ({
                is_git_repo: true,
                remote_url: info.remoteUrl,
                current_branch: info.currentBranch,
                default_branch: info.defaultBranch,
                repo_name: basename(path),
            })),
        );
    });

    // GET /branches?path=...
    app.get('/branches', zValidator('query', gitBranchesQuerySchema), (c) => {
        const { path } = c.req.valid('query');
        return asyncResultToResponse(
            c,
            gitService.listBranches(path).map((branches) => ({ branches })),
        );
    });

    // GET /scan?roots=...&max_depth=...
    app.get('/scan', zValidator('query', gitScanQuerySchema), (c) => {
        const query = c.req.valid('query');
        const roots = query.roots?.split(',').map((s: string) => s.trim()) ?? config.scanRoots;
        const maxDepth = query.max_depth ? parseInt(query.max_depth, 10) : config.scanMaxDepth;

        c.header('Content-Type', 'application/x-ndjson');
        return stream(c, async (s) => {
            for await (const repo of gitService.scanForRepos(roots, maxDepth)) {
                await s.write(
                    JSON.stringify({
                        path: repo.path,
                        name: repo.name,
                        remote_url: repo.remoteUrl,
                        current_branch: repo.currentBranch,
                        default_branch: repo.defaultBranch,
                    }) + '\n',
                );
            }
        });
    });

    return app;
}
