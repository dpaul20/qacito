import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runTestsHandler, SpecNotFoundError } from './handler.js';
import { RunTestsInputSchema } from './schema.js';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';

/**
 * Registers the `run_tests` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { scriptPath: string; timeoutMs?: number; maxRetries?: number; projectRoot?: string }
 *   Output: { status, summary, failures, durationMs, logs, attempt, can_retry,
 *             blocker_report? }
 *
 * Error cases (surfaced as `isError: true`):
 *   - `SpecNotFound`      — the spec file does not exist on disk.
 *   - `PathOutOfBounds`   — scriptPath escapes the sandbox root.
 *
 * Self-healing protocol:
 *   - `can_retry: true`  → Claude Desktop may rewrite the spec and call again.
 *   - `can_retry: false` → retry budget exhausted; `blocker_report` is present.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'run_tests',
    'Execute a Playwright spec file and return a structured JSON report with ' +
      'pass/fail summary, per-test failure details (message + truncated stack), ' +
      'and self-healing metadata (attempt count, can_retry flag). Pass ' +
      'projectRoot to specify which project to run tests against (falls back ' +
      'to process.cwd()). When can_retry is true, Claude Desktop can rewrite the ' +
      'spec via write_file and call run_tests again. Retries are tracked per ' +
      'spec path in memory for the lifetime of the server process.',
    RunTestsInputSchema.shape,
    async (rawInput) => {
      const root = rawInput.projectRoot ?? process.cwd();

      // Parse and apply defaults via Zod before passing to the handler.
      const parseResult = RunTestsInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'InvalidInput',
                detail: parseResult.error.message,
              }),
            },
          ],
          isError: true,
        };
      }

      const input = parseResult.data;

      process.stderr.write(
        `[run_tests] root="${root}" scriptPath="${input.scriptPath}" ` +
          `timeoutMs=${input.timeoutMs} maxRetries=${input.maxRetries}\n`,
      );

      try {
        const output = await runTestsHandler(root, input);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        if (err instanceof SpecNotFoundError || err instanceof PathOutOfBoundsError) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: (err as SpecNotFoundError | PathOutOfBoundsError).code,
                  detail: err.message,
                }),
              },
            ],
            isError: true,
          };
        }

        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'RunTestsError', detail: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
