import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getChangedFilesHandler,
  GitNotFoundError,
  NoGitRepoError,
} from './handler.js';
import { GetChangedFilesInputSchema } from './schema.js';
import { PathOutOfBoundsError } from '../../shared/sandbox.js';

/**
 * Registers the `get_changed_files` MCP tool into the server.
 *
 * Tool contract:
 *   Input:  { projectPath: string; staged?: boolean; base?: string; filter?: string[] }
 *   Output: { base, changedFiles, totalChanged }
 *
 * Error cases (surfaced as `isError: true`):
 *   - `GitNotFound`     — git binary not on PATH.
 *   - `NoGitRepo`       — projectPath is not inside a git repository.
 *   - `PathOutOfBounds` — projectPath escapes the sandbox root.
 *
 * @param server  The MCP Server instance provided by register-tools.ts.
 */
export function register(server: McpServer): void {
  server.tool(
    'get_changed_files',
    'Returns git-changed file paths for a project directory. Uses git diff --name-only. ' +
      'Supports staged flag, custom base ref, and substring filter. ' +
      'Error codes: GitNotFound, NoGitRepo.',
    GetChangedFilesInputSchema.shape,
    async (rawInput) => {
      const parseResult = GetChangedFilesInputSchema.safeParse(rawInput);
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
        const output = await getChangedFilesHandler(input);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output),
            },
          ],
        };
      } catch (err: unknown) {
        if (
          err instanceof GitNotFoundError ||
          err instanceof NoGitRepoError ||
          err instanceof PathOutOfBoundsError
        ) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: (err as GitNotFoundError | NoGitRepoError | PathOutOfBoundsError).code,
                  detail: err.message,
                }),
              },
            ],
            isError: true,
          };
        }

        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'GetChangedFilesError', detail: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
