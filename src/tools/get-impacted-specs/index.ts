import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getImpactedSpecsHandler } from './handler.js';
import { GetImpactedSpecsInputSchema } from './schema.js';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';

export function register(server: McpServer): void {
  server.tool(
    'get_impacted_specs',
    'Given a list of changed source files, returns which Playwright spec files directly import ' +
      'those files — so only relevant tests are run instead of the full suite. ' +
      'Analysis is static (regex-based import parsing), not transitive. ' +
      'Pair with get_changed_files to get the changed file list from git. ' +
      'specsDir defaults to "tests/" relative to projectRoot.',
    GetImpactedSpecsInputSchema.shape,
    async (rawInput) => {
      const root = rawInput.projectRoot ?? process.cwd();

      const parseResult = GetImpactedSpecsInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const output = await getImpactedSpecsHandler(root, parseResult.data);
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
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GetImpactedSpecsError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
