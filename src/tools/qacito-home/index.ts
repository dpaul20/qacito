import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { qacitoHomeSchema } from './schema.js';
import { qacitoHomeHandler } from './handler.js';
import { registerHtmlResource } from '../../shared/register-app-resource.js';

const RESOURCE_URI = 'ui://qacito-home/home.html';

export function register(server: McpServer): void {
  registerAppTool(
    server,
    'qacito_home',
    {
      title: 'QAcito Home',
      description:
        'Open QAcito home screen — shows all available actions as clickable cards inside Claude Desktop.',
      inputSchema: qacitoHomeSchema.shape,
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args) => {
      const parsed = qacitoHomeSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'QacitoHomeError', detail: parsed.error.message }) }],
          isError: true,
        };
      }
      try {
        const meta = await qacitoHomeHandler();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(meta) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'QacitoHomeError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );

  registerHtmlResource(server, 'QAcito Home UI', RESOURCE_URI, 'home.html');
}
