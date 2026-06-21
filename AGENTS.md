# AGENTS.md — QAcito Code Review Rules

These rules are enforced on every commit by Gentleman Guardian Angel.
Review only `.ts` and `.js` files; ignore test files (`*.test.ts`, `*.spec.ts`).

---

## Architecture

**Vertical slice structure is mandatory.** Every tool must live under `src/tools/{tool-name}/` and expose exactly these files:
- `schema.ts` — Zod input schema and inferred type. No business logic.
- `handler.ts` — Pure async function. No MCP imports. Returns plain data.
- `index.ts` — Single `register(server: McpServer)` function. The only file allowed to import from `@modelcontextprotocol/sdk`.

**`src/server/register-tools.ts` is the only place that imports tool slices** (`index.ts` files that register with MCP). If a new tool slice is imported outside `register-tools.ts`, flag it.

**Exception — `src/batch/orchestrator.ts`:** Batch mode drives Claude directly without the MCP server layer. It imports tool `handler.ts` files directly (not `index.ts` slices). This is intentional and is not a violation.

**Handlers must not import from `@modelcontextprotocol/sdk`.** MCP coupling belongs exclusively in `index.ts`.

---

## Security

**Every caller-supplied path must go through `resolveSafe(root, p)` before any filesystem or process operation.** There are no exceptions. Passing a raw string from tool input to `fs`, `path.resolve`, or `child_process` without `resolveSafe` is a critical violation.

**Never trust `projectRoot` from tool input directly** — always pass it through `resolveSafe` or use it as the `root` argument to `resolveSafe`.

---

## TypeScript

**All Zod schemas use `.safeParse()` in `index.ts` before passing to the handler.** Never call a handler with unvalidated input.

**Schemas export both the Zod object and the inferred type:**
```ts
export const MyInputSchema = z.object({ ... });
export type MyInput = z.infer<typeof MyInputSchema>;
```

**Array index access returns `T | undefined`** (`noUncheckedIndexedAccess` is enabled). Never cast `arr[i]` to `T` — guard it or use nullish coalescing.

**All imports of local modules use the `.js` extension**, even for `.ts` source files. This is required by `moduleResolution: NodeNext`.

---

## Error handling

**Domain errors are typed classes with a `readonly code` string literal:**
```ts
export class MyError extends Error {
  readonly code = 'MyError';
  constructor(...) { super(...); this.name = 'MyErrorError'; }
}
```

**`index.ts` catches domain errors and converts them to `isError: true` MCP responses** with the `.code` as the `error` field. Generic `Error` becomes `RunTestsError` or equivalent. Never let an unhandled rejection escape `register()`.

**Non-fatal errors (e.g. history write failures) are logged to stderr and swallowed**, not propagated.

---

## Logging

**`console.log` is forbidden.** It corrupts the stdio JSON-RPC wire. Use `process.stderr.write(...)` for all server-side logging.

**Log format:** `[tool-name] key=value key=value\n` — structured, single line, newline-terminated.

---

## Run store

**No `await` inside a run-store read-modify-write cycle.** Node.js single-thread safety depends on synchronous mutations between read and write. Adding `await` inside a read-modify-write path without explicit serialisation is a concurrency bug.

---

## MCP tool responses

**Tool handlers return `{ content: [{ type: 'text', text: JSON.stringify(output) }] }`.** Never return raw objects or non-JSON strings.

**Error responses add `isError: true`** to the return value alongside `content`.

---

## Tests

**Tests are co-located with their tool** (`src/tools/{name}/*.test.ts`) and use Playwright test runner — not Jest or Vitest. Import from `@playwright/test`, not from any Jest globals.

**`run_tests_n_times` runs are always sequential** — never parallelise them. Concurrent Playwright processes cause port conflicts.
