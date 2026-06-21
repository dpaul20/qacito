import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getRunStatusHandler, RunNotFoundError } from './handler.js';
import { GetRunStatusInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'get_run_status',
    'Poll the status of a test run previously started with start_test_run. ' +
      'Returns the full run detail including per-test results. ' +
      'Status values: "running" (still executing), "passed", "failed", "timeout", "error", "blocked". ' +
      'Poll every few seconds until status is no longer "running". ' +
      'Runs are kept in memory for the lifetime of the server process and persisted to disk.',
    GetRunStatusInputSchema.shape,
    async (rawInput) => {
      const parseResult = GetRunStatusInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const run = await getRunStatusHandler(parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(run) }] };
      } catch (err: unknown) {
        if (err instanceof RunNotFoundError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: err.code, detail: err.message }) }],
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GetRunStatusError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
