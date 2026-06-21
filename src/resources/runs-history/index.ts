import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listRuns } from '../../dashboard-server/run-store.js';

export function register(server: McpServer): void {
  server.resource(
    'runs-history',
    'runs://history',
    async (uri) => {
      const runs = listRuns(20);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ count: runs.length, runs }),
        }],
      };
    },
  );
}
