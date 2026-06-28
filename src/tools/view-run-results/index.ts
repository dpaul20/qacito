import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { viewRunResultsSchema } from './schema.js';
import { viewRunResultsHandler, RunNotFoundError, NoRunsError } from './handler.js';

const RESOURCE_URI = 'ui://view-run-results/mcp-app.html';

// Compiled to dist/tools/view-run-results/index.js  →  ../../.. → project root
// But mcp-app.html lives in dist/, so we go up only two levels: ../..
const DIST_DIR = path.join(import.meta.dirname, '../..');

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

  registerAppResource(
    server,
    'View Run Results UI',
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const htmlPath = path.join(DIST_DIR, 'view-run-results.html');
      const html = await fs.readFile(htmlPath, 'utf-8');
      return {
        contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );
}
