import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkEnvironmentHandler } from './handler.js';
import { CheckEnvironmentBaseSchema, CheckEnvironmentInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'check_environment',
    'Pre-flight health check before running tests. ' +
      'Verifies: URL reachability (HTTP), env var presence, TCP port availability. ' +
      'Returns ok:false with per-check breakdown — probe failures are data, not errors. ' +
      'At least one of url, envVars, or ports must be provided.',
    CheckEnvironmentBaseSchema.shape,
    async (rawInput: unknown) => {
      const parseResult = CheckEnvironmentInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const output = await checkEnvironmentHandler(process.cwd(), parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'CheckEnvironmentError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
