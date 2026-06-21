import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getApiTemplateHandler } from './handler.js';
import { GetApiTemplateInputSchema } from './schema.js';

/**
 * Registers the `get_api_template` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { method: 'GET'|'POST'|'PUT'|'DELETE'|'error'; endpoint: string; expectedStatus?: number }
 *   Output: { template: string; type: string; variables: string[] }
 *
 * The returned `template` is a ready-to-use Playwright `.spec.ts` string that
 * uses the `request` fixture (no page/browser interactions). Known fields
 * (`endpoint`, `expectedStatus`) are already substituted. The `variables` array
 * lists remaining {{PLACEHOLDER}} values Claude must fill before calling write_file.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'get_api_template',
    'Generate a ready-to-use Playwright API test spec (.spec.ts) for a given HTTP ' +
      'method and endpoint. The template uses the `request` fixture exclusively — ' +
      'no page or browser interactions. Known values (endpoint, expectedStatus) are ' +
      'pre-substituted. The response includes the template string and a `variables` ' +
      'array listing {{PLACEHOLDER}} values still to be filled before passing the ' +
      'spec to write_file. Supported methods: GET, POST, PUT, DELETE, error (4xx).',
    GetApiTemplateInputSchema.shape,
    async (rawInput: { method: string; endpoint: string; expectedStatus?: number }) => {
      const parseResult = GetApiTemplateInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'InvalidInput',
                detail: parseResult.error.message,
              }),
            },
          ],
          isError: true,
        };
      }

      const input = parseResult.data;

      try {
        const output = await getApiTemplateHandler(input);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'GetApiTemplateError', detail: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
