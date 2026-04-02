# LLM Codebase Guide — Agent Code Reviewer

This file is a fast orientation map for future LLMs working in this repo.

## What this app does

Agent Code Reviewer (ACR) is a local-first review system for code produced by agents/LLMs:

- tracks repo sessions and snapshots of diffs
- lets users draft/send/resolve comments in a web UI
- exposes MCP tools so coding agents can check comments, reply, resolve, and import PR comments

## Monorepo layout

```
packages/
  shared/       shared types + zod schemas + errors
  server/       Hono API + sql.js persistence + SSE + git/watch logic
  web/          Angular UI (home, review, comments, settings)
  mcp-server/   MCP stdio server bridging to server /api/mcp endpoints
```

## Start points by package

### Server (`packages/server`)

- App wiring: `src/app.ts`
- Process startup: `src/index.ts`
- DB schema: `src/db/schema.sql`
- Core routes:
    - `src/routes/repos.routes.ts`
    - `src/routes/sessions.routes.ts`
    - `src/routes/snapshots.routes.ts`
    - `src/routes/comments.routes.ts`
    - `src/routes/mcp.routes.ts`
    - `src/routes/sse.routes.ts`
- Core services:
    - `src/services/repo.service.ts`
    - `src/services/session.service.ts`
    - `src/services/watcher.service.ts`
    - `src/services/comment.service.ts`

### Web (`packages/web`)

- Router: `src/app/app.routes.ts`
- Shell/layout: `src/app/shared/components/layout.ts`
- Home flow (add/open/delete repo): `src/app/features/home/home.ts`
- Review screen: `src/app/features/review/review.ts`
- Session list sidebar: `src/app/features/review/session-sidebar/session-sidebar.ts`
- API wrapper: `src/app/core/services/api-client.ts`
- Session state + SSE handling: `src/app/core/stores/session-store.ts`
- SSE client: `src/app/core/services/sse-connection.ts`

### Shared (`packages/shared`)

- API contracts/schemas: `src/types/api.ts`
- Session type: `src/types/session.ts`
- SSE event types: `src/types/sse-events.ts`

### MCP Server (`packages/mcp-server`)

- Entry: `src/index.ts`
- HTTP bridge: `src/api-client.ts`
- Tool registration:
    - `src/tools/check-comments.ts`
    - `src/tools/get-details.ts`
    - `src/tools/reply-to-comment.ts`
    - `src/tools/mark-resolved.ts`
    - `src/tools/capture-snapshot.ts`
    - `src/tools/import-pr-comments.ts`

## Core runtime flows

## 1) Repo lifecycle

1. Web home lists repos via `GET /api/repos`.
2. Add repo calls `POST /api/repos` with local path.
3. Delete repo calls `DELETE /api/repos/:id`.

Important: deleting a repo cascades to sessions, snapshots, comments (DB foreign keys in `schema.sql`).

## 2) Session lifecycle (current behavior)

1. User clicks **Open** on home repo card.
2. Web calls `POST /api/sessions`.
3. Server `sessionService.getOrCreateSession(repo_id, path)` uses current git branch.
4. Server captures initial snapshot via watcher service.
5. Web navigates to `/review/:sessionId`.

Important current invariant:

- `sessions` has `UNIQUE(repo_id, branch)`.
- There is no session status field (no `completed`/`archived`).
- There is no `DELETE /api/sessions/:id` or `complete session` endpoint.

## 3) Snapshot + monitoring

- Manual capture: `POST /api/sessions/:id/snapshots`
- Monitor toggles:
    - start: `POST /api/sessions/:id/watch`
    - stop: `DELETE /api/sessions/:id/watch`
- Server watcher polls git HEAD and emits SSE updates.

## 4) Comments + threads

- Web comments API under `/api/comments`.
- Comment statuses: `draft`, `sent`, `resolved`.
- SSE comment updates trigger comment store refresh in UI.

## 5) MCP agent interaction

- MCP server talks to `/api/mcp/*`.
- Typical tool loop:
    1. `check_comments`
    2. `get_comment_details`
    3. `reply_to_comment`
    4. `mark_comment_resolved`
    5. optional `capture_snapshot`

Current MCP selection behavior:

- for repo-scoped MCP calls, backend often picks the latest session (`sessions[0]` after list ordering).

## Important gaps / constraints (as of now)

1. **No first-class “complete session” lifecycle.**
2. Users currently clean up by deleting repo from home.
3. Session sidebar has no complete/delete actions.
4. Session type/API contracts do not include lifecycle fields (`status`, `completed_at`, etc.).

## Suggested read order for future LLMs

1. `README.md`
2. `packages/server/src/app.ts`
3. `packages/server/src/db/schema.sql`
4. `packages/server/src/routes/sessions.routes.ts`
5. `packages/server/src/services/session.service.ts`
6. `packages/web/src/app/features/home/home.ts`
7. `packages/web/src/app/features/review/review.ts`
8. `packages/web/src/app/core/stores/session-store.ts`
9. `packages/shared/src/types/api.ts`
10. `packages/server/src/routes/mcp.routes.ts`

## Quick mental model

- **Repo** = tracked local git repo
- **Session** = review workspace for one repo + current branch
- **Snapshot** = a diff capture against base branch at a point in time
- **Comment** = threaded review feedback tied to snapshot/session
- **MCP** = automation layer for agent replies/resolution/import
