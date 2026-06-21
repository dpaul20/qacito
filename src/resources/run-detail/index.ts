import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getRun } from '../../dashboard-server/run-store.js';

export function register(server: McpServer): void {
  server.resource(
    'run-detail',
    new ResourceTemplate('runs://{runId}', { list: undefined }),
    async (uri, { runId }) => {
      if (!runId) throw new Error('runId is required');
      const run = getRun(runId as string);
      if (!run) throw new Error(`Run not found: ${runId}`);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(run),
        }],
      };
    },
  );
}
