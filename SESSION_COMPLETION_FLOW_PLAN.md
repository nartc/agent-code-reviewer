# Session Completion Flow Plan

Goal: make **"complete session"** a first-class lifecycle action, so users no longer need to delete repos to clean up review work.

## Problem statement

Current state:

- sessions are created/reused per `(repo_id, branch)`
- no session completion status in DB/type/API
- no complete/delete session endpoint
- UI cleanup path today is repo deletion

This causes data-loss-oriented cleanup and muddles active vs historical review context.

---

## Desired user experience

### Primary flow (from review screen)

1. User is in `review/:sessionId`.
2. Clicks **Complete Session**.
3. Confirm modal shows blockers summary:
    - unresolved sent comments count
    - draft comments count
    - monitoring status
4. User confirms completion.
5. Session transitions to `completed`:
    - monitoring stops automatically
    - review becomes read-only
    - session still visible in history

### Secondary flow (from session list/home)

- Session list (`session-sidebar`) can filter active/completed.
- Completed sessions show badge and muted style.
- Optional actions:
    - reopen completed session
    - create/open active session for current repo branch

---

## Lifecycle model

States:

- `active`
- `completed`

Transitions:

- `active -> completed` via complete action
- `completed -> active` via reopen action (optional but recommended)

Rules:

- Only one active session per `(repo_id, branch)`
- Completed sessions are immutable/read-only for snapshot/comment writes
- Session completion should be idempotent

---

## API contract changes

Shared contracts file: `packages/shared/src/types/api.ts`

### New endpoints

1. `POST /api/sessions/:id/complete`

Request:

```json
{ "force": false, "reason": "review complete", "completed_by": "user" }
```

Response (200):

```json
{
    "session": {
        "id": "...",
        "status": "completed",
        "completed_at": "2026-04-02T...Z",
        "completion_reason": "review complete"
    },
    "summary": {
        "draft_count": 0,
        "unresolved_sent_count": 0,
        "watcher_stopped": true
    }
}
```

Blocked (409, when `force=false` and blockers exist):

```json
{
    "error": { "code": "SESSION_COMPLETION_BLOCKED", "message": "Unresolved comments exist" },
    "blockers": { "draft_count": 2, "unresolved_sent_count": 3 }
}
```

2. `POST /api/sessions/:id/reopen`

Request:

```json
{ "reason": "follow-up changes" }
```

Response (200): `{ "session": { ...status: "active", completed_at: null } }`

### Existing endpoint extensions

- `GET /api/sessions?repo_id=...&status=active|completed|all`
    - default: `active`

---

## Database + migration plan

Schema file: `packages/server/src/db/schema.sql`

### `sessions` additions

- `status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed'))`
- `completed_at TEXT NULL`
- `completion_reason TEXT NULL`
- `completed_by TEXT NULL`

### Uniqueness update

Current `UNIQUE(repo_id, branch)` prevents opening new sessions after completion.

Replace with partial unique index:

```sql
CREATE UNIQUE INDEX idx_sessions_repo_branch_active
ON sessions(repo_id, branch)
WHERE status = 'active';
```

### Migration behavior

- Backfill existing rows to `status='active'`
- Rebuild table/indexes safely for SQLite/sql.js
- Keep historical sessions intact

---

## Server interaction changes

### Touchpoints

- `packages/server/src/routes/sessions.routes.ts`
    - add complete/reopen routes
    - add status filter query handling
- `packages/server/src/services/session.service.ts`
    - implement completion/reopen business logic
    - enforce one active session per repo+branch
- `packages/server/src/services/watcher.service.ts`
    - stop watcher on completion
    - reject watcher start for completed sessions
- `packages/server/src/routes/snapshots.routes.ts`
    - reject snapshot capture on completed session
- `packages/server/src/routes/comments.routes.ts`
    - reject write operations on completed session

### SSE implications

Shared event file: `packages/shared/src/types/sse-events.ts`

Add event:

```ts
{
    type: 'session-status';
    data: {
        session_id: string;
        status: 'active' | 'completed';
        completed_at: string | null;
    }
}
```

Server emits when session completes/reopens.

---

## Web interaction changes

### API + state

- `packages/web/src/app/core/services/api-client.ts`
    - add `completeSession()`
    - add `reopenSession()`
    - support session status filter in `listSessions()`
- `packages/web/src/app/core/stores/session-store.ts`
    - expose `isCompleted`
    - react to `session-status` SSE events
    - guard UI writes when completed
- `packages/web/src/app/core/services/sse-connection.ts`
    - include `session-status` event parsing

### UI

- `packages/web/src/app/features/review/review.ts`
    - add complete session button + confirmation modal
    - switch to read-only controls when completed
- `packages/web/src/app/features/review/session-sidebar/session-sidebar.ts`
    - show status badges + filtering
- `packages/web/src/app/features/home/home.ts` and/or `repo-card.ts`
    - optional quick complete/reopen affordances

---

## MCP interaction changes

Current MCP route logic (`packages/server/src/routes/mcp.routes.ts`) tends to pick newest session (`sessions[0]`).

Update behavior:

- resolve **latest active** session by default
- if no active session exists, return explicit actionable error
- prevent snapshot capture/reply/resolve writes against completed sessions

Optional improvement:

- allow explicit `session_id` in MCP tool inputs where ambiguity exists (`check_comments`, `capture_snapshot`)

---

## Edge cases

1. Complete while watcher running -> stop watcher first, then complete.
2. Complete with unresolved comments -> block unless `force=true`.
3. Double-click complete -> idempotent success.
4. Concurrent write during completion -> server-side status checks must win.
5. Reopen when active session already exists for same repo+branch -> return conflict.
6. Older UI client without lifecycle support -> server still protects state.

---

## Rollout sequence

1. **Data + contracts**: DB fields + shared types/schemas.
2. **Server lifecycle**: complete/reopen + write guards + watcher integration.
3. **SSE/store**: session-status event support.
4. **UI**: complete/reopen UX in review + session lists.
5. **MCP alignment**: latest-active selection + explicit errors.

---

## Acceptance criteria

- User can complete session from review UI without deleting repo.
- Completed sessions stay visible, but are read-only.
- Opening repo after completion yields/creates active session correctly.
- MCP tooling does not operate on completed sessions by default.
- Watchers do not keep running after completion.
- Existing session data migrates safely.
