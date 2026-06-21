import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_COUNT, RESOURCE_COUNT, PROMPT_COUNT } from '../../shared/registry-meta.js';
import { getDashboardUrl } from '../../dashboard-server/index.js';

const START_TIME = Date.now();

export function register(server: McpServer): void {
  server.resource(
    'project-info',
    'project://info',
    async (uri) => {
      const info = {
        name:         'qacito',
        version:      '0.1.0',
        tools:        TOOL_COUNT,
        resources:    RESOURCE_COUNT,
        prompts:      PROMPT_COUNT,
        uptimeMs:     Date.now() - START_TIME,
        nodeVersion:  process.version,
        dashboardUrl: getDashboardUrl(),
      };
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(info),
        }],
      };
    },
  );
}
