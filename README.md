# QAcito

Autonomous QA platform powered by Claude + Playwright. Point it at any project and let AI write, run, and fix your tests.

---

## Philosophy

QAcito doesn't replace a QA engineer — it removes the mechanical work so the engineer can focus on what actually requires judgement.

**QAcito is the execution layer.** It exposes tools: run tests, read files, write specs, check coverage, detect flakiness. By itself it does nothing.

**Claude is the brain.** It decides what to test, writes the specs, reads the errors, and retries. The server is intentionally dumb — it executes, it never decides.

What gets automated is the repetitive loop: write a spec → run it → read the error → fix it → run it again. What stays human: test strategy, coverage decisions, exploratory testing, and reviewing what the AI produces.

A QA engineer using QAcito generates 10x more coverage in less time — because the mechanical part is delegated. The judgement stays yours.

---

## How it works

QAcito is an MCP server. Claude Code (or any MCP-compatible client) connects to it and uses its tools to perform QA autonomously:

1. Claude analyzes your project and decides what to test
2. It writes Playwright specs and runs them through QAcito
3. If a test fails, Claude reads the error, fixes the spec, and retries
4. At the end, it generates a full QA report

The server is intentionally "dumb" — it executes, it never decides. Claude is the brain.

---

## Requirements

- Node.js 20+
- Claude Code (or any MCP-compatible client — Claude Desktop also supported)
- Playwright installed in the project under test (`npx playwright install`)

---

## Installation

Build the project and register it as an MCP server with `claude mcp add` (recommended). The platform install scripts are optional helpers.

### macOS / Linux

```bash
git clone https://github.com/your-org/qacito
cd qacito
npm install
npm run build
claude mcp add --scope user qacito -- node "$(pwd)/dist/server/index.js"
```

### Windows

```powershell
git clone https://github.com/your-org/qacito
cd qacito
npm install
npm run build
claude mcp add --scope user qacito -- node "$((Get-Location).Path)\dist\server\index.js"
```

Verify with `claude mcp list`, then restart Claude Code. QAcito will appear as available tools in your next session.

---

## Connect to Claude Desktop

Edit `claude_desktop_config.json` and add QAcito as an MCP server:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "qacito": {
      "command": "node",
      "args": ["/absolute/path/to/qacito/dist/server/index.js"]
    }
  }
}
```

Restart Claude Desktop. QAcito will appear under connected MCP servers.

---

## Usage

Once connected, just tell Claude what you want:

> "Analyze `/projects/my-app` and write tests for the authentication flow."

> "Run the specs in `/projects/my-app/tests/` and fix any failures."

> "Generate a QA report for the last test run."

Claude calls the tools automatically — you never invoke them directly.

---

## Tools

QAcito currently exposes 21 tools. Core tools:

### `analyze_project`
Scans a project and produces a structured test plan: tech stack, base URL, and a list of test cases with step-by-step descriptions.

```
projectRoot  string   Absolute path to the project root
```

---

### `detect_stack`
Detects the tech stack of a project — framework, language, bundler, routes, package manager.

```
projectPath  string   Path to the project
```

---

### `read_files`
Reads one or more files. Claude uses this to understand existing code before writing tests.

```
paths        string[]  File paths to read (relative or absolute)
projectRoot  string?   Optional root for resolving relative paths
```

---

### `write_file`
Writes a file to disk. Used by Claude to save generated specs.

```
path         string   Destination path
content      string   File content
projectRoot  string?  Optional root for resolving relative paths
```

---

### `run_tests`
Executes a Playwright spec. Returns pass/fail status, output, and whether the self-healing loop can still retry.

```
scriptPath   string   Path to the .spec.ts file
timeoutMs    number   Max execution time in ms  (default: 120000)
maxRetries   number   Max self-healing retries  (default: 3)
projectRoot  string?  Optional project root
```

---

### `get_api_template`
Returns a ready-to-use Playwright spec template for a given HTTP method and endpoint. Useful for bootstrapping API tests without writing boilerplate.

```
method          GET | POST | PUT | DELETE | error | screenshot
endpoint        string   URL path, e.g. /api/users
expectedStatus  number   Expected HTTP status code (default: 200)
```

---

### `get_changed_files`
Returns the list of files changed in git since a given base ref. Claude uses this to run targeted tests only on what changed.

```
projectPath  string    Path to the git repository
staged       boolean   Include only staged changes  (default: false)
base         string    Base ref to compare against  (default: HEAD)
filter       string[]? Glob patterns to filter results
```

---

### `get_test_history`
Returns the history of past test runs, optionally filtered by project or spec file.

```
projectRoot  string?  Filter by project
specPath     string?  Filter by spec file
limit        number?  Max results to return
```

---

### `update_visual_baselines`
Re-runs a spec in baseline-update mode to refresh visual regression snapshots.

```
scriptPath   string   Path to the spec file
projectRoot  string?  Optional project root
timeoutMs    number   Max execution time in ms  (default: 120000)
```

---

### `generate_report`
Generates a QA report (Markdown + HTML) from a completed test run.

```
runId      string   ID of the test run
outputDir  string   Directory where the report files will be written
```

---

### `start_test_run`
Fires a Playwright spec **asynchronously** and returns a `runId` immediately — does not block. Designed for parallel subagent workflows where multiple agents run different specs concurrently. Retry logic is the orchestrator's responsibility.

```
scriptPath   string   Path to the .spec.ts file
projectRoot  string?  Optional project root
timeoutMs    number   Max execution time in ms  (default: 120000)
```

Returns: `{ runId, status: "started", dashboardUrl }`

---

### `get_run_status`
Polls the status of a run started with `start_test_run`. Returns the full run detail including per-test results. Poll until `status` is no longer `"running"`.

```
runId  string   The run ID returned by start_test_run
```

Status values: `running` · `passed` · `failed` · `timeout` · `error` · `blocked`

---

Additional tools available: `get_coverage`, `get_impacted_specs`, `run_tests_n_times`, `generate_from_openapi`, `check_accessibility`, `check_environment`, `discover_routes`, `setup_auth`, `dual_evaluate`.

---

## Parallel subagent workflow

For Claude to orchestrate multiple test suites in parallel, use `start_test_run` instead of `run_tests`:

```
Orchestrator Claude
  ├── Subagent A → start_test_run(auth.spec.ts)   → runId-A
  ├── Subagent B → start_test_run(checkout.spec.ts) → runId-B
  └── Subagent C → start_test_run(api.spec.ts)     → runId-C

Each subagent polls get_run_status(runId) independently.
When failed: rewrite spec via write_file → start_test_run again.
```

Use namespaced output paths to avoid spec collisions between agents:
```
tests/runs/{runId}/auth.spec.ts
tests/runs/{runId}/checkout.spec.ts
```

---

## Dashboard

When the server starts, it launches a local dashboard on an auto-assigned port (logged to stderr on startup). It shows live test run status, history, and plans.

```
[qacito-dashboard] Listening on http://localhost:50000
```

---

## Batch mode

For running QA headlessly without a Claude client (e.g. in CI):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run batch -- --project /path/to/project --output report.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `--project` / `-p` | required | Path to the project to test |
| `--output` / `-o` | `qacito-report.json` | Output report file |
| `--max-retries` | `3` | Retries per failing test |
| `--max-iterations` | `20` | Max agent turns |

Exit code `0` if all tests pass, `1` if any fail.

---

## Security

Every path provided by the caller goes through `resolveSafe()` before any filesystem or process operation. A path outside the resolved sandbox root throws `PathOutOfBoundsError` and never reaches the OS.

---

## Project structure

```
src/
  server/           MCP server entry point and tool registration
  tools/            One directory per tool (schema, handler, tests)
  dashboard-server/ HTTP + WebSocket server for the live dashboard
  batch/            Headless orchestrator for CI runs
  shared/           Sandbox path validation, history store
```

Each tool is a vertical slice: its own schema, handler, and unit tests — no cross-tool dependencies.

---

## License

MIT
