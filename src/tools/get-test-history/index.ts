import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTestHistoryHandler } from './handler.js';
import { GetTestHistoryInputSchema } from './schema.js';

/**
 * Registers the `get_test_history` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { projectRoot?: string; specPath?: string; limit?: number }
 *   Output: { entries: HistoryEntry[]; total: number }
 *
 * Error cases (surfaced as `isError: true`):
 *   - `HistoryReadError` — unexpected I/O failure reading the history file.
 *
 * Returns an empty array when no history exists (ENOENT is handled gracefully).
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'get_test_history',
    'Returns past test run entries from ~/.qacito/history.jsonl. ' +
      'Filter by projectRoot or specPath (substring match). ' +
      'Limit caps results. Returns empty array when no history exists.',
    GetTestHistoryInputSchema.shape,
    async (rawInput) => {
      const parseResult = GetTestHistoryInputSchema.safeParse(rawInput);
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

      try {
        const output = await getTestHistoryHandler(input);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'HistoryReadError', detail: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
