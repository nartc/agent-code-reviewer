import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { basename } from 'node:path';
import type { GitService } from '../services/git.service.js';
import type { AppConfig } from '../lib/config.js';
import { asyncResultToResponse } from '../lib/result-to-response.js';
import { gitInfoQuerySchema, gitBranchesQuerySchema, gitScanQuerySchema } from '@agent-code-reviewer/shared';

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
        const roots = query.roots?.split(',').map((s) => s.trim()) ?? config.scanRoots;
        const maxDepth = query.max_depth ? parseInt(query.max_depth, 10) : config.scanMaxDepth;

        return stream(c, async (s) => {
            c.header('Content-Type', 'application/x-ndjson');
            for await (const repo of gitService.scanForRepos(roots, maxDepth)) {
                await s.write(
                    JSON.stringify({
                        path: repo.path,
                        name: repo.name,
                        remote_url: repo.remoteUrl,
                    }) + '\n',
                );
            }
        });
    });

    return app;
}
