# Agent Code Reviewer

AI-powered code review tool with MCP integration. Lets AI coding agents (Claude Code, OpenCode, etc.) review your code changes, leave comments, and have threaded discussions — all visible in a web UI.

## Architecture

```
packages/
  shared/       — shared types & schemas (zod)
  server/       — Hono HTTP server, SQLite DB, SSE, git operations
  web/          — Angular 21 frontend (Tailwind 4 + DaisyUI)
  mcp-server/   — MCP server (stdio) exposing review tools to AI agents
```

## Prerequisites

- Node.js 20+
- pnpm 10+ (`corepack enable` if needed)

## Getting Started

```bash
# install dependencies
pnpm install

# copy and configure env
cp packages/server/.env.example packages/server/.env
```

Edit `packages/server/.env` — at a minimum, set `SCAN_ROOTS`:

```env
# comma-separated directories containing git repos you want to review
SCAN_ROOTS=/path/to/your/code
```

### Start the dev servers

```bash
# terminal 1 — backend (http://localhost:3847)
pnpm nx serve server

# terminal 2 — frontend (http://localhost:4200, proxies /api to :3847)
pnpm nx serve web
```

The SQLite database is auto-created at `.data/reviewer.db` on first server run.

## MCP Server Setup

The MCP server lets AI agents interact with code reviews. The main server must be running.

```bash
# build mcp-server and print config snippets
pnpm setup-mcp
```

This outputs JSON config for **Claude Code** and **OpenCode**. Copy the relevant snippet into the `.mcp.json` (or `opencode.json`) of the **repo you want reviewed** — not this repo.

Example `.mcp.json` for a target repo:

```json
{
    "mcpServers": {
        "agent-code-reviewer": {
            "type": "stdio",
            "command": "node",
            "args": ["/absolute/path/to/agent-code-reviewer/packages/mcp-server/dist/index.js"],
            "env": { "SERVER_URL": "http://localhost:3847" }
        }
    }
}
```

### MCP Tools

| Tool                    | Description                                   |
| ----------------------- | --------------------------------------------- |
| `check_comments`        | List unresolved comments for the current repo |
| `get_comment_details`   | Get a comment thread with replies             |
| `reply_to_comment`      | Reply to a comment as the agent               |
| `mark_comment_resolved` | Mark a comment as resolved                    |

## Environment Variables

### Server (`packages/server/.env`)

| Variable         | Default             | Description                                       |
| ---------------- | ------------------- | ------------------------------------------------- |
| `SCAN_ROOTS`     | `$HOME`             | Comma-separated directories to scan for git repos |
| `SCAN_MAX_DEPTH` | `3`                 | Max depth when scanning for repos                 |
| `PORT`           | `3847`              | Server port                                       |
| `DB_PATH`        | `.data/reviewer.db` | SQLite database file path                         |

### MCP Server

| Variable     | Default                 | Description               |
| ------------ | ----------------------- | ------------------------- |
| `SERVER_URL` | `http://localhost:3847` | URL of the running server |

## Development

```bash
# typecheck all packages
pnpm nx run-many -t typecheck

# build mcp-server
pnpm nx build mcp-server

# run mcp-server tests
pnpm nx test mcp-server
```

## License

MIT
