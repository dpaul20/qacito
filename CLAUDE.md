# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (TypeScript only)
npm run build

# Build dashboard + TypeScript
npm run build:all

# Run MCP server (stdio transport)
npm start

# Run MCP server (HTTP transport on port 4712)
npm run start:http

# Run all tests (unit + integration)
npx playwright test

# Run a single test file
npx playwright test src/tools/run-tests/retry-tracker.test.ts

# Build .mcpb distributable
npm run build:mcpb

# Run headless batch orchestrator (CI mode, requires ANTHROPIC_API_KEY)
npm run batch -- --project /path/to/project --output report.json

# Register QAcito as MCP server (global — available in all projects)
claude mcp add --scope user qacito -- node "$(pwd)/dist/server/index.js"

# Register QAcito as MCP server (project-only — writes .mcp.json in the target project)
claude mcp add --scope project qacito -- node "/absolute/path/to/QAcito/dist/server/index.js"

# Verify registration and connection
claude mcp list

# (Legacy) TUI wizard — writes to settings.json, does NOT register the MCP correctly
node scripts/install.mjs
```

> **Note:** `install.mjs` writes to `~/.claude/settings.json` which Claude Code does not read for MCP servers. Always use `claude mcp add` instead. MCPs are stored in `~/.claude.json` (user scope) or `.mcp.json` (project scope).

## Architecture

QAcito is an MCP server with a strict separation: **Claude decides, QAcito executes**. The server never interprets results or chooses what to test — that's Claude's job.

### Transports

`src/server/index.ts` boots two layers before accepting MCP connections:

1. **Dashboard server** (`src/dashboard-server/`) — Express + WebSocket on a dynamic port (50000–59999). Must start first because tools depend on its run-store and WS broadcaster.
2. **MCP transport** — stdio (default) or HTTP (`QACITO_HTTP_PORT=4712`).

### Tool slices

Every tool is a self-contained vertical slice under `src/tools/{tool-name}/`:

```
schema.ts    — Zod input schema
handler.ts   — pure business logic (no MCP coupling)
index.ts     — register(server) wires schema + handler into MCP
*.test.ts    — co-located Playwright tests
```

`src/server/register-tools.ts` is the only file that imports all slices. Adding a new tool means creating the slice and adding one line there. Each registration is wrapped in try/catch — a broken slice never brings down the server.

The same pattern applies to `register-resources.ts` (3 MCP resources: `runs-history`, `run-detail`, `project-info`) and `register-prompts.ts` (6 system prompts: `qa:full-suite`, `qa:on-change`, `qa:fix-failures`, `qa:audit`, `qa:black-box-suite`, `qa:from-design`). `src/shared/registry-meta.ts` holds the authoritative counts (`TOOL_COUNT`, `RESOURCE_COUNT`, `PROMPT_COUNT`) — update it whenever you add or remove primitives.

### Sandbox

Every path from a caller goes through `resolveSafe(root, p)` in `src/shared/sandbox.ts` before touching the filesystem or spawning a process. It throws `PathOutOfBoundsError` if the resolved path escapes the project root. This is the single security boundary — don't bypass it.

### Async run store

`src/dashboard-server/run-store.ts` holds in-memory state for async test runs (`start_test_run` → `get_run_status`). Node.js is single-threaded: all read-modify-write cycles are synchronous (no `await` inside them). If you add `await` inside a run-store mutation, you must add explicit serialisation.

### Batch mode

`src/batch/` is a standalone headless orchestrator for CI. It uses `@anthropic-ai/sdk` to drive Claude directly (no MCP client needed). Entry: `npm run batch`.

### Dashboard

`dashboard/` is a Vite-built React SPA served statically by the dashboard server. Build with `npm run build:dashboard`. The built output lands in `src/dashboard-server/public/` (copied by `scripts/copy-public.js`).

### Persistence

In-memory state is backed by JSONL files in `~/.qacito/`:

- `runs.jsonl` — test run history (capped at 50 in memory)
- `plans.jsonl` — saved test plans per project
- `history.jsonl` — per-spec execution history for flakiness tracking

All writes are atomic OS-level (append/overwrite, not partial). Do not add `await` inside any read-modify-write cycle in `run-store.ts` or `plans-store.ts`.

### Error handling

Handlers throw typed domain errors (`PathOutOfBoundsError`, `SpecNotFoundError`). Batch operations return per-item errors rather than aborting — for example, `read_files` returns an error field per file, never fails the whole call. The MCP registration layer converts thrown errors to `isError: true` responses.

### Test conventions

Tests use `@playwright/test` (`test`, `expect`, `test.describe`). There is no Jest or Vitest. Each test creates its own isolated temp directory (use `fs.mkdtempSync`) to avoid state pollution across tests. No mocking — tests hit real filesystem and real subprocesses.

## Key constraints

- `console.log` is redirected to stderr at startup — any write to stdout corrupts the stdio JSON-RPC wire. Use `process.stderr.write()` for all server-side logging.
- TypeScript is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Array index access returns `T | undefined`.
- Tests use Playwright as the test runner for both unit and integration tests — not Jest or Vitest.
- `run_tests_n_times` runs are sequential by design; parallel runs cause Playwright port conflicts.
- A `runId` is only valid for the lifetime of the server process. Restarting clears all run state.
