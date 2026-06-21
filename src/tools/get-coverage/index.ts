import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCoverageHandler } from './handler.js';
import { GetCoverageInputSchema } from './schema.js';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';

export function register(server: McpServer): void {
  server.tool(
    'get_coverage',
    'Read the Istanbul/NYC coverage report (coverage-summary.json) from a project and return ' +
      'per-file line, statement, function and branch coverage percentages. ' +
      'Use threshold to get a list of files below a target (e.g. 80%). ' +
      'If no report is found, returns instructions on how to enable coverage. ' +
      'Run test:coverage first to generate fresh data before calling this tool.',
    GetCoverageInputSchema.shape,
    async (rawInput) => {
      const root = rawInput.projectRoot ?? process.cwd();

      const parseResult = GetCoverageInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const output = await getCoverageHandler(root, parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        if (err instanceof PathOutOfBoundsError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: err.code, detail: err.message }) }],
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GetCoverageError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
