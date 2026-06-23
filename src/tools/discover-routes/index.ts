import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { discoverRoutesHandler, InvalidUrlError } from './handler.js';
import { DiscoverRoutesInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'discover_routes',
    'Discover routes/URLs of a live site via sitemap.xml or Playwright link crawl. ' +
      'Pass projectRoot (absolute path to the project directory) to enable a filesystem fallback: ' +
      'when the crawl returns only the root URL (typical for SPAs with client-side routing), ' +
      'the tool scans Next.js App Router (app/**/page.tsx) or Pages Router (pages/**/*.tsx) ' +
      'files and derives additional routes from the file tree. ' +
      'source is "crawl+filesystem" or "filesystem" when the fallback is used.',
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
