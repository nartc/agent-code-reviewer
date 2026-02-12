import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { RepoService } from '../services/repo.service.js';
import { resultToResponse } from '../lib/result-to-response.js';
import { createRepoSchema, updateRepoSchema } from '@agent-code-reviewer/shared';
import { idParamSchema } from './params.js';

export function createRepoRoutes(repoService: RepoService): Hono {
    const app = new Hono();

    // GET / — List repos
    app.get('/', (c) => {
        return resultToResponse(c, repoService.listRepos().map((repos) => ({ repos })));
    });

    // POST / — Register/get repo from path
    app.post('/', zValidator('json', createRepoSchema), async (c) => {
        const { path } = c.req.valid('json');
        const result = await repoService.createOrGetFromPath(path);
        if (result.isErr()) {
            return resultToResponse(c, result);
        }
        const { repo, repoPath, isNew } = result.value;
        return c.json({ repo, repo_path: repoPath, is_new: isNew }, isNew ? 201 : 200);
    });

    // PATCH /:id — Update base branch
    app.patch('/:id', zValidator('param', idParamSchema), zValidator('json', updateRepoSchema), (c) => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');
        if (!body.base_branch) {
            return c.json({ error: { code: 'VALIDATION', message: 'base_branch is required' } }, 400);
        }
        return resultToResponse(c, repoService.updateRepo(id, { baseBranch: body.base_branch }));
    });

    // DELETE /:id — Remove repo
    app.delete('/:id', zValidator('param', idParamSchema), (c) => {
        const { id } = c.req.valid('param');
        const result = repoService.deleteRepo(id);
        if (result.isErr()) {
            return resultToResponse(c, result);
        }
        return c.body(null, 204);
    });

    return app;
}
