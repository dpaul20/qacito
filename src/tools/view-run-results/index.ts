import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { viewRunResultsSchema } from './schema.js';
import { viewRunResultsHandler, RunNotFoundError, NoRunsError } from './handler.js';
import { registerHtmlResource } from '../../shared/register-app-resource.js';

const RESOURCE_URI = 'ui://view-run-results/mcp-app.html';

export function register(server: McpServer): void {
  registerAppTool(
    server,
    'view_run_results',
    {
      title: 'View Run Results',
      description:
        'Display the results of a test run as an interactive UI. ' +
        'Omit runId to show the latest completed run.',
      inputSchema: viewRunResultsSchema.shape,
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args) => {
      const parsed = viewRunResultsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'ViewRunResultsError', detail: parsed.error.message }) }],
          isError: true,
        };
      }
      try {
        const run = await viewRunResultsHandler(parsed.data);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(run) }],
        };
      } catch (err: unknown) {
        if (err instanceof RunNotFoundError || err instanceof NoRunsError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as RunNotFoundError | NoRunsError).code, detail: err.message }) }],
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'ViewRunResultsError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );

  registerHtmlResource(server, 'View Run Results UI', RESOURCE_URI, 'view-run-results.html');
}
