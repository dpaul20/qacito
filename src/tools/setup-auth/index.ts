import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  setupAuthHandler,
  MfaRequiredError,
  LoginPageUnreachableError,
} from './handler.js';
import { SetupAuthInputSchema } from './schema.js';
import { AuthEnvVarMissingError } from '../../shared/auth-context.js';

export function register(server: McpServer): void {
  server.tool(
    'setup_auth',
    'Perform a headless form login and save the browser session (storageState) for reuse in auth-gated test runs.',
    SetupAuthInputSchema.shape,
    async (rawInput) => {
      const parseResult = SetupAuthInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'InvalidInput', detail: parseResult.error.message }) }],
          isError: true,
        };
      }

      process.stderr.write(`[setup_auth] baseUrl="${parseResult.data.baseUrl}" loginUrl="${parseResult.data.loginUrl}"\n`);

      try {
        const output = await setupAuthHandler(parseResult.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
      } catch (err: unknown) {
        for (const [Cls, code] of [
          [AuthEnvVarMissingError,    'AuthEnvVarMissing'],
          [MfaRequiredError,          'MfaRequired'],
          [LoginPageUnreachableError, 'LoginPageUnreachable'],
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
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'SetupAuthError', detail: msg }) }],
          isError: true,
        };
      }
    },
  );
}
