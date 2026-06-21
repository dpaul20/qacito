import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  checkAccessibilityHandler,
  InvalidUrlSchemeError,
  NavigationFailedError,
  CheckAccessibilityTimeoutError,
  MissingAxeCoreError,
} from './handler.js';
import { CheckAccessibilityInputSchema } from './schema.js';

export function register(server: McpServer): void {
  server.tool(
    'check_accessibility',
    'Audit a URL for accessibility violations using axe-core and Playwright. ' +
      'Returns structured WCAG violations (impact, description, element, criteria). ' +
      'Requires @axe-core/playwright — returns install instructions if missing. ' +
      'Does not gate on violations — returns data, Claude decides severity.',
    CheckAccessibilityInputSchema.shape,
    async (rawInput) => {
      const root = process.cwd();

      const parseResult = CheckAccessibilityInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      process.stderr.write(`[check_accessibility] url="${parseResult.data.url}"\n`);

      try {
        const output = await checkAccessibilityHandler(root, parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        for (const [Cls, code] of [
          [InvalidUrlSchemeError,          'InvalidUrlScheme'],
          [MissingAxeCoreError,            'MissingAxeCore'],
          [NavigationFailedError,          'NavigationFailed'],
          [CheckAccessibilityTimeoutError, 'CheckAccessibilityTimeout'],
        ] as const) {
          if (err instanceof Cls) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: code, detail: (err as Error).message }) }],
              isError: true,
            };
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'CheckAccessibilityError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
