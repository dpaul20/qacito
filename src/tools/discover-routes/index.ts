import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { discoverRoutesHandler, InvalidUrlError } from './handler.js';
import { DiscoverRoutesInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'discover_routes',
    'Discover routes/URLs of a live site via sitemap.xml or Playwright link crawl. No source code required.',
    DiscoverRoutesInputSchema.shape,
    async (rawInput: unknown) => {
      const parseResult = DiscoverRoutesInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      try {
        const output = await discoverRoutesHandler(parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        if (err instanceof InvalidUrlError) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: err.code, detail: err.message }) }],
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'DiscoverRoutesError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
